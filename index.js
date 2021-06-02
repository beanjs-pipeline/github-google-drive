const actions = require('@actions/core');
const { google } = require('googleapis');
const fs = require('fs');
const archiver = require('archiver');

/** Google Service Account credentials  encoded in base64 */
const credentials = actions.getInput('credentials', { required: true });
/** Google Drive Folder ID to upload the file/folder to */
const folder = actions.getInput('folder', { required: true });
/** Local path to the file/folder to upload */
const target = actions.getInput('target', { required: true });
/** Optional name for the zipped file */
const name = actions.getInput('name', { required: true });
/** Link to the Drive folder */
const link = 'link';

const credentialsJSON = JSON.parse(Buffer.from(credentials, 'base64').toString());
const scopes = ['https://www.googleapis.com/auth/drive'];
const auth = new google.auth.JWT(credentialsJSON.client_email, null, credentialsJSON.private_key, scopes);
const drive = google.drive({ version: 'v3', auth });

const driveLink = `https://drive.google.com/drive/folders/${folder}`
// const targetPath = target.split('/').pop();

async function main() {
  actions.setOutput(link, driveLink);
  const dateNow=new Date(Date.now());
  const zipFileName=`${name}-${dateNow.toISOString().split('T')[0]}-${dateNow.getTime()}.zip`

  actions.info(`Folder detected in ${target}`)
  actions.info(`Zipping ${target}...`)

  let zipPromise=null
  if(fs.lstatSync(target).isDirectory()){
    zipPromise=zipDirectory(target,zipFileName)
  }else{
    zipPromise=zipFile(target,zipFileName)
  }

  if(zipPromise){
    zipPromise
      .then(()=>uploadToDrive(zipFileName))
      .catch((e)=>{
        actions.error('Zip failed');
        throw(e)
      })
  }
}

/**
 * Zips a directory and stores it in memory
 * @param {string} source File or folder to be zipped
 * @param {string} out Name of the resulting zipped file
 */
function zipDirectory(source, out) {
  const archive = archiver('zip', { zlib: { level: 9 }});
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close',
      () => {
        actions.info(`Folder successfully zipped: ${archive.pointer()} total bytes written`);
        return resolve();
      });
    archive.finalize();
  });
}

function zipFile(file,out){
  const archive = archiver('zip', { zlib: { level: 9 }});
  const stream = fs.createWriteStream(out);

  return new Promise((resolve,reject)=>{
    const fileName = file.split('/').pop();
    
    archive
      .file(file,{name:fileName})
      .on("error",(e)=>reject(e))
      .pipe(stream)

    stream.on('close',()=>{
      actions.info(`Folder successfully zipped: ${archive.pointer()} total bytes written`);
      return resolve();
    })

    archive.finalize()
  })
}

/**
 * Uploads the file to Google Drive
 */
function uploadToDrive(zipFile) {
  actions.info('Uploading file to Goole Drive...');
  drive.files.create({
    requestBody: {
      name: zipFile,
      parents: [folder]
    },
    media: {
      body: fs.createReadStream(zipFile)
    }
  }).then(() => actions.info('File uploaded successfully'))
    .catch(e => {
      actions.error('Upload failed');
      throw e;
    });
}

main().catch(e => actions.setFailed(e));
