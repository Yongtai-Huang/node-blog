'use strict';

let router = require('express').Router();
let mongoose = require('mongoose');
let Article = mongoose.model('Article');

// return a list of tags
router.get('/', function(req, res, next) {
  Article.find().distinct('tagList').then(function(tags){
    return res.json({tags: tags.sort()});
  }).catch(next);
});

module.exports = router;
