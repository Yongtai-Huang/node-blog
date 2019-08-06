'use strict';

const mongoose = require('mongoose');
const router = require('express').Router();
const passport = require('passport');
const User = mongoose.model('User');
const auth = require('../auth');
const multer  = require('multer');
const fs = require('fs');
const path = require('path');
const randomstring = require('randomstring');

const avatarFileSizeLimit = Math.pow(1024, 2);  // 1 MB

// Set the storage
const avatar_dir = path.join(__dirname, '../..', 'public/upload', 'avatars');
const storage = multer.diskStorage({
  destination: avatar_dir
});

// Init Upload
const upload = multer({
  storage: storage,
  limits: {fileSize: avatarFileSizeLimit},
  fileFilter: function(req, file, cb){
    checkFileType(file, cb);
  }
}).single('uploadFile');

// Check File Type
function checkFileType(file, cb){
  // Allowed ext
let filetypes = /jpeg|jpg|png|gif/;
  // Check ext
let extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
let mimetype = filetypes.test(file.mimetype);

  if(mimetype && extname){
    return cb(null, true);
  } else {
    let err = new Error();
    err.code = 'filetype';
    return cb(err);
  }
}

function renameAvatarFile(file) {
  return new Promise(function(resolve, reject) {
    let filename = "ava" + "-" + (new Date).valueOf() + "-" + file.originalname;

    fs.rename(file.path, path.join(avatar_dir, filename), function(err) {
      if (err) reject(err)
      resolve(filename);
    });

  });
}

function removeAvatarFile(filename) {
  return new Promise(function(resolve, reject) {

    fs.unlink(path.join(avatar_dir, filename), function(err) {
      if(err && err.code == 'ENOENT') {
        console.info("File doesn't exist, won't remove it.");
        reject(err);
      } else if (err) {
        console.error("Error occurred while trying to remove image file");
        reject(err);
      }

      console.info(`previous image file removed`);
      resolve();
    });

  });
}


router.get('/user', auth.required, function(req, res, next){
  User.findById(req.payload.id).then(function(user){
    if(!user){ return res.sendStatus(401); }

    return res.json({user: user.toAuthJSON()});
  }).catch(next);
});

router.put('/user', auth.required, function(req, res, next){
  upload(req, res, function(err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        console.log('File size is too large. Max limit is 1MB.');
        return res.status(422).json({errors: {'File size error': "File size is too large. Max limit is 1 MB."}});
      } else if (err.code === 'filetype') {
        console.log('Filetype is invalid. Must be .png, .jpeg, .jpg. or .gif.');
        return res.status(422).json({errors: {'File type error': "File type is invalid. Must be .png, .jpeg, .jpg. or .gif."}});
      } else {
        console.log('Fail to submit');
        return res.status(422).json({errors: {'Submit error': "Fail to submit."}});
      }
    }

    User.findById(req.payload.id).then(function(user) {
      if(!user){ return res.sendStatus(401); }

      return Promise.all([
        req.file ? renameAvatarFile(req.file) : null,
        (req.file || req.body.removePhoto === 'true') && user.image ? removeAvatarFile(user.image) : null
      ]).then(function(results){
        let filename = results[0];

        if(filename){
          user.image = filename;
        }

        if( !filename && req.body.removePhoto === 'true'){
          user.image = '';
        }

        // Only update fields that were actually passed
        if(typeof req.body.username !== 'undefined'){
          user.username = req.body.username;
        }
        if(typeof req.body.email !== 'undefined'){
          user.email = req.body.email;
        }
        if(typeof req.body.bio !== 'undefined'){
          user.bio = req.body.bio;
        }

        if(req.body.password){
          user.setPassword(req.body.password);
        }

        // Save the change
        return user.save().then( function(userData) {
          res.json({user: userData.toAuthJSON()});
        });
      });

    }).catch(next);
  });
});

router.post('/users/login', function(req, res, next){
  if(!req.body.user.email){
    return res.status(422).json({errors: {email: "can't be blank"}});
  }

  if(!req.body.user.password){
    return res.status(422).json({errors: {password: "can't be blank"}});
  }

  passport.authenticate('local', {session: false}, function(err, user, info){
    if(err){ return next(err); }

    if(user){
      user.token = user.generateJWT();
      return res.json({user: user.toAuthJSON()});
    } else {
      return res.status(422).json(info);
    }
  })(req, res, next);
});

router.post('/users', function(req, res, next){
  let user = new User();

  user.username = req.body.user.username;
  user.email = req.body.user.email;
  user.setPassword(req.body.user.password);

  user.save().then(function(){
    return res.json({user: user.toAuthJSON()});
  }).catch(next);

});

module.exports = router;
