'use strict';

const router = require('express').Router();
const mongoose = require('mongoose');
const Article = mongoose.model('Article');
const ArticleComment = mongoose.model('ArticleComment');
const User = mongoose.model('User');
const auth = require('../auth');
const multer  = require('multer');
const fs = require('fs');
const path = require('path');

const imageFileSizeLimit = Math.pow(1024, 2);  // 1 MB
const imgFileSizeLimit = Math.pow(1024, 2);  // 1 MB

// Set the storage
// Store the main image of a article
const image_dir = path.join(__dirname, '../..', 'public/upload/articles', 'images');
// Store the images uploaded in the article body
const imgs_dir = path.join(__dirname, '../..', 'public/upload/articles/', 'imgs');

const image_storage = multer.diskStorage({
  destination: image_dir
});

const img_storage = multer.diskStorage({
  destination: imgs_dir
});

// Init upload for article.image
const image_upload = multer({
  storage: image_storage,
  limits: {fileSize: imageFileSizeLimit},
  fileFilter: function(req, file, cb){
    checkFileType(file, cb);
  }
}).single('uploadFile');

// article.imgs[]
const img_upload = multer({
  storage: img_storage,
  limits: {fileSize: imgFileSizeLimit},
  fileFilter: function(req, file, cb){
    checkFileType(file, cb);
  }
}).single('file');

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

function renameImageFile(file) {
  return new Promise(function(resolve, reject) {
    let filename = "a" + (new Date).valueOf() + "-" + file.originalname;

    fs.rename(file.path, path.join(image_dir, filename), function(err) {
      if (err) reject(err)
      resolve(filename);
    });

  });
}

function renameImgFile(file) {
  return new Promise(function(resolve, reject) {
    let filename = "b" + (new Date).valueOf() + "-" + file.originalname;

    fs.rename(file.path, path.join(imgs_dir, filename), function(err) {
      if (err) reject(err)
      resolve(filename);
    });

  });
}

function removeImageFile(filename) {
  return new Promise(function(resolve, reject) {

    fs.unlink(path.join(image_dir, filename), function(err) {
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

function removeImgFiles(filenames) {
  return new Promise(function(resolve, reject) {
    let i = 0;
    filenames.forEach(function(filename) {
      fs.unlink(path.join(imgs_dir, filename), function(err) {
        if(err && err.code == 'ENOENT') {
          console.info("File doesn't exist, won't remove it.");
          reject(err);
        } else if (err) {
          console.error("Error occurred while trying to remove img file");
          reject(err);
        }
        console.info(`previous img file removed`);

        if (++i === filenames.length) {
          resolve (true);
        }

      });
    });

  });
}

// Remove uploaded image files that are already deleted in the article body
// Problem: If image file is uploaded but the article modification is not saved, the image file will be stored but not displayed.
// article.imgs[], req.body.imgFileList[]
function removeExtraImgFiles(imgs, imgFileList) {
  return new Promise(function(resolve, reject) {
    let extraImgs = [];
    imgs.forEach(function(img) {
      if (imgFileList.indexOf(img) < 0) {
        extraImgs.push(img);
      }
    });

    if (extraImgs.length === 0) {
      resolve (true);
    }

    let i = 0;
    extraImgs.forEach(function(filename) {
      fs.unlink(path.join(imgs_dir, filename), function(err) {
        if(err && err.code == 'ENOENT') {
          console.info("File doesn't exist, won't remove it.");
          // reject(err);
        } else if (err) {
          console.error("Error occurred while trying to remove img file");
          reject(err);
        }
        console.info(`previous img file removed`);

        if (++i === extraImgs.length) {
          resolve (true);
        }

      });
    });
  });
}

// Preload article objects on routes with ':article'
router.param('article', function(req, res, next, slug) {
  Article.findOne({ slug: slug})
    .populate('author')
    .then(function (article) {
      if (!article) { return res.sendStatus(404); }

      req.article = article;

      return next();
    }).catch(next);
});

router.param('articleComment', function(req, res, next, id) {
  ArticleComment.findById(id).then(function(articleComment){
    if(!articleComment) { return res.sendStatus(404); }

    req.articleComment = articleComment;

    return next();
  }).catch(next);
});

router.get('/', auth.optional, function(req, res, next) {
  let query = {};
  let limit = 20;
  let offset = 0;

  if(typeof req.query.limit !== 'undefined'){
    limit = req.query.limit;
  }

  if(typeof req.query.offset !== 'undefined'){
    offset = req.query.offset;
  }

  if( typeof req.query.tag !== 'undefined' ){
    query.tagList = {"$in" : [req.query.tag]};
  }

  Promise.all([
    req.query.author ? User.findOne({username: req.query.author}) : null,
    req.query.upvoted ? User.findOne({username: req.query.upvoted}) : null,
    req.query.downvoted ? User.findOne({username: req.query.downvoted}) : null
  ]).then(function(results){
    let author = results[0];
    let upvoter = results[1];
    let downvoter = results[2];

    if (author) {
      query.author = author._id;
    }

    if (upvoter) {
      query._id = {$in: upvoter.articleUpvotes};
    } else if(req.query.upvoted){
      query._id = {$in: []};
    }

    if (downvoter) {
      query._id = {$in: downvoter.articleDownvotes};
    } else if(req.query.downvoted){
      query._id = {$in: []};
    }

    return Promise.all([
      Article.find(query)
        .limit(Number(limit))
        .skip(Number(offset))
        .sort({createdAt: 'desc'})
        .populate('author')
        .exec(),
      Article.count(query).exec(),
      req.payload ? User.findById(req.payload.id) : null
    ]).then(function(results){
      let articles = results[0];
      let articlesCount = results[1];
      let user = results[2];

      return res.json({
        articles: articles.map(function(article){
          return article.toJSONFor(user);
        }),
        articlesCount: articlesCount
      });
    });
  }).catch(next);
});

router.get('/feed', auth.required, function(req, res, next) {
  let limit = 20;
  let offset = 0;

  if(typeof req.query.limit !== 'undefined'){
    limit = req.query.limit;
  }

  if(typeof req.query.offset !== 'undefined'){
    offset = req.query.offset;
  }

  User.findById(req.payload.id).then(function(user){
    if (!user) { return res.sendStatus(401); }

    return Promise.all([
      Article.find({ author: {$in: user.following}})
        .limit(Number(limit))
        .skip(Number(offset))
        .sort({createdAt: 'desc'})
        .populate('author')
        .exec(),
      Article.count({ author: {$in: user.following}})
    ]).then(function(results){
      let articles = results[0];
      let articlesCount = results[1];

      return res.json({
        articles: articles.map(function(article){
          return article.toJSONFor(user);
        }),
        articlesCount: articlesCount
      });
    });
  }).catch(next);
});

router.post('/', auth.required, function(req, res, next) {
  image_upload(req, res, function(err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        console.log('File size is too large. Max limit is 1 MB.');
        return res.status(422).json({errors: {'File size': "is too large. Max limit is 1 MB."}});
      } else if (err.code === 'filetype') {
        console.log('Filetype is invalid. Must be .png, .jpeg, .jpg. or .gif.');
        return res.status(422).json({errors: {'File type': "is invalid. Must be .png, .jpeg, .jpg. or .gif."}});
      } else {
        console.log('Fail to submit');
        return res.status(422).json({errors: {Err: "to submit."}});
      }
    }

    console.log(req.body);

    User.findById(req.payload.id).then(function(user) {
      if (!user) { return res.sendStatus(401); }

      if (!req.body.title || !req.body.body) { return res.sendStatus(404); }

      let article = new Article();

      article.author = user;
      article.title = req.body.title;
      article.body = req.body.body;

      if (req.body.description) {
        article.description = req.body.description;
      }

      if (req.body.tagList) {
        article.tagList = JSON.parse(req.body.tagList);
      }

      return Promise.resolve(req.file ? renameImageFile(req.file) : null)
      .then(function(filename) {
        if (filename) {
          article.image = filename;
        }

        return article.save().then( function(articleData) {
          return res.json({article: articleData.toJSONFor(user)});
        });
      });
    }).catch(next);

  });
});

// return a article
router.get('/:article', auth.optional, function(req, res, next) {
  Promise.all([
    req.payload ? User.findById(req.payload.id) : null,
    req.article.populate('author').execPopulate()
  ]).then(function(results){
    let user = results[0];

    return res.json({article: req.article.toJSONFor(user)});
  }).catch(next);
});

// update article
router.put('/:article', auth.required, function(req, res, next) {
  image_upload(req, res, function(err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        console.log('File size is too large. Max limit is 1 MB.');
        return res.status(422).json({errors: {'File size': "is too large. Max limit is 1 MB."}});
      } else if (err.code === 'filetype') {
        console.log('Filetype is invalid. Must be .png, .jpeg, .jpg. or .gif.');
        return res.status(422).json({errors: {'File type': "is invalid. Must be .png, .jpeg, .jpg. or .gif."}});
      } else {
        console.log('Fail to submit');
        return res.status(422).json({errors: {'Err': "to submit."}});
      }
    }

    User.findById(req.payload.id).then(function(user) {
      if(!user || req.article.author._id.toString() !== req.payload.id.toString()){
        return res.sendStatus(401);
      }

      let updatedArticle = req.article;

      if(typeof req.body.title !== 'undefined'){
        updatedArticle.title = req.body.title;
      }

      if(typeof req.body.description !== 'undefined'){
        updatedArticle.description = req.body.description;
      }

      if(typeof req.body.body !== 'undefined'){
        updatedArticle.body = req.body.body;
      }

      if (req.body.tagList) {
        updatedArticle.tagList = JSON.parse(req.body.tagList);
      }

      console.log(req.body.imgFileList);

      let imgFileList = [];
      if (req.body.imgFileList) {
        imgFileList = JSON.parse(req.body.imgFileList);
      }

      return Promise.all([
        req.file ? renameImageFile(req.file) : null,
        (req.file || req.body.removeImage === 'true') && req.article.image ? removeImageFile(req.article.image) : null,
        updatedArticle.imgs && updatedArticle.imgs.length ? removeExtraImgFiles(updatedArticle.imgs, imgFileList) : null
      ]).then(function(results){
        let filename = results[0];

        if (filename) {
          updatedArticle.image = filename;
        }

        if( !filename && req.body.removeImage === 'true'){
          updatedArticle.image = '';
        }

        if (imgFileList.length) {
          updatedArticle.imgs = imgFileList;
        }

        return updatedArticle.save().then( function(article) {
          return res.json({article: article.toJSONFor(user)});
        });
      });
    }).catch(next);
  });

});

// Delete article
router.delete('/:article', auth.required, function(req, res, next) {
  const articleId = req.article._id;
  User.findById(req.payload.id).then(function(user){
    if(!user || req.article.author._id.toString() !== req.payload.id.toString()){
      return res.sendStatus(403);
    }

    return Promise.all([
      req.article.remove(),
      req.article.image ? removeImageFile(req.article.image) : null,
      req.article.imgs && req.article.imgs.length ? removeImgFiles(req.article.imgs) : null
    ]).then(function() {
      return User.update( {articleUpvotes: {$in: [articleId]}}, {$pull: {articleUpvotes: articleId}}, { safe: true }, function(err) {
        if (err) {
          console.error("Error occurred while removing article upvotes");
          return res.sendStatus(403);
        }

        return User.update( {articleDownvotes: {$in: [articleId]}}, {$pull: {articleDownvotes: articleId}}, { safe: true }, function(err) {
          if (err) {
            console.error("Error occurred while removing article downvotes");
            return res.sendStatus(403);
          }
          return res.sendStatus(204);
        });
      });
    });
  }).catch(next);
});


// Upload an image and display it in article body
router.put('/imgs/:article', auth.required, function(req, res, next) {
    img_upload(req, res, function(err) {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          console.log('File size is too large. Max limit is 1 MB.');
          return res.status(422).json({errors: {'File size': "is too large. Max limit is 1 MB."}});
        } else if (err.code === 'filetype') {
          console.log('Filetype is invalid. Must be .png, .jpeg, .jpg. or .gif.');
          return res.status(422).json({errors: {'File type': "is invalid. Must be .png, .jpeg, .jpg. or .gif."}});
        } else {
          console.log('Fail to submit');
          return res.status(422).json({errors: {Err: "to submit."}});
        }
      }

      Promise.resolve( req.payload.id ? User.findById(req.payload.id) : null )
      .then(function(result) {
        let user = result;

        if (!user) { return res.sendStatus(401); }

        return Promise.resolve(req.file ? renameImgFile(req.file) : null)
        .then(function(filename) {
          if (filename) {
            req.article.imgs.push(filename);
          }

          return req.article.save().then( function() {
            return res.json({file: filename});
          });

        });

      }).catch(next);

    });
  });

// Upvote an article
router.post('/:article/upvote', auth.required, function(req, res, next) {
  const articleId = req.article._id;
  User.findById(req.payload.id).then(function(user){
    if (!user || user._id.toString() === req.article.author._id.toString()) {
      return res.status(401).json({errors: {'Unauthorized error': "You are not allowed to upvote this article."}});
    }

    if (user.articleUpvotes.indexOf(articleId) > -1) {
      return res.sendStatus(400);
    }

    user.articleUpvotes.push(articleId);

    let ind = user.articleDownvotes.indexOf(articleId);
    if (ind > -1) {
      user.articleDownvotes.splice(ind, 1);
    }

    return user.save().then( function(userData){
      return req.article.updateUpDownvoteCount().then(function(article){
        return res.json({article: article.toJSONFor(userData)});
      });
    });
  }).catch(next);
});

// Downvote an article
router.post('/:article/downvote', auth.required, function(req, res, next) {
  const articleId = req.article._id;

  User.findById(req.payload.id).then(function(user){

    if (!user || user._id.toString() === req.article.author._id.toString()) {
      return res.status(401).json({errors: {'Unauthorized error': "You are not allowed to downvote this article."}});
    }

    if (user.articleDownvotes.indexOf(articleId) > -1) {
      return res.sendStatus(400);
    }

    user.articleDownvotes.push(articleId);

    let ind = user.articleUpvotes.indexOf(articleId);
    if (ind > -1) {
      user.articleUpvotes.splice(ind, 1);
    }

    return user.save().then( function(userData){
      return req.article.updateUpDownvoteCount().then(function(article){
        return res.json({article: article.toJSONFor(userData)});
      });
    });
  }).catch(next);
});

// Cancel upvote an article
router.delete('/:article/upvote', auth.required, function(req, res, next) {
  const articleId = req.article._id;

  User.findById(req.payload.id).then(function(user){

    if (!user || user._id.toString() === req.article.author._id.toString()) {
      return res.status(401).json({errors: {'Unauthorized error': "You are not allowed to cancel the upvote on this article."}});
    }

    let ind = user.articleUpvotes.indexOf(articleId);
    if (ind < 0) {
      return res.sendStatus(404);
    }

    user.articleUpvotes.splice(ind, 1);
    return user.save().then( function(userData){
      return req.article.updateUpvoteCount().then(function(article){
        return res.json({article: article.toJSONFor(userData)});
      });
    });
  }).catch(next);
});


// Cancel downvote an article
router.delete('/:article/downvote', auth.required, function(req, res, next) {
  const articleId = req.article._id;

  User.findById(req.payload.id).then(function(user){

    if (!user || user._id.toString() === req.article.author._id.toString()) {
      return res.status(401).json({errors: {'Unauthorized error': "You are not allowed to cancel the downvote on this article."}});
    }

    let ind = user.articleDownvotes.indexOf(articleId);
    if (ind < 0) {
      return res.sendStatus(404);
    }
    user.articleDownvotes.splice(ind, 1);

    return user.save().then( function(userData){
      return req.article.updateDownvoteCount().then( function(article){
        return res.json({article: article.toJSONFor(userData)});
      });
    });

  }).catch(next);
});

// Get an article's comments
router.get('/:article/articleComments', auth.optional, function(req, res, next){
  Promise.resolve(req.payload ? User.findById(req.payload.id) : null).then(function(user){
    return req.article.populate({
      path: 'articleComments',
      populate: { path: 'author' },
      options: { sort: { createdAt: 'desc' } }
    }).execPopulate().then(function(article) {
      return res.json({articleComments: req.article.articleComments.map(function(articleComment){
        return articleComment.toJSONFor(user);
      })});
    });
  }).catch(next);
});

// Create a new comment
router.post('/:article/articleComments', auth.required, function(req, res, next) {
  User.findById(req.payload.id).then(function(user){
    if(!user){ return res.sendStatus(401); }

    let articleComment = new ArticleComment(req.body.articleComment);
    articleComment.article = req.article;
    articleComment.author = user;

    return articleComment.save().then(function(){
      req.article.articleComments.push(articleComment);

      return req.article.save().then(function(article) {
        return res.json({articleComment: articleComment.toJSONFor(user)});
      });
    });
  }).catch(next);
});

// Remove a comment
router.delete('/:article/articleComments/:articleComment', auth.required, function(req, res, next) {
  if(req.articleComment.author.toString() !== req.payload.id.toString()){
    return res.sendStatus(401);
  }

  req.article.articleComments.remove(req.articleComment._id);
  req.article.save()
  .then(ArticleComment.find({_id: req.articleComment._id}).remove().exec())
  .then(function(){
    return res.sendStatus(204);
  }).catch(next);
});

module.exports = router;
