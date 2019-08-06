'use strict';

const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');
const slug = require('slug');
const User = mongoose.model('User');
const ArticleComment = mongoose.model('ArticleComment');

const ArticleSchema = new mongoose.Schema({
  slug: {type: String, lowercase: true, unique: true},
  title: String,
  imgs: [String],
  image: String,
  description: String,
  body: String,
  upvotesCount: {type: Number, default: 0},
  downvotesCount: {type: Number, default: 0},
  articleComments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ArticleComment' }],
  tagList: [{ type: String }],
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {timestamps: true});

ArticleSchema.plugin(uniqueValidator, {message: 'is already taken'});

ArticleSchema.pre('validate', function(next){
  if(!this.slug)  {
    this.slugify();
  }

  next();
});

ArticleSchema.methods.slugify = function() {
  this.slug = slug(this.title) + '-' + (Math.random() * Math.pow(36, 6) | 0).toString(36);
};

// Remove the comments on the article that has been removed
ArticleSchema.post('remove', function(next){
  let article = this;
  return ArticleComment.remove({article: article._id}, function(err) {
    if (err) {
      console.error("Error occurred while trying to remove article comments");
      return res.sendStatus(403);
    }
  });
});

// Update the number of upvotes on the article
ArticleSchema.methods.updateUpvoteCount = function() {
  let article = this;
  return User.count({articleUpvotes: {$in: [article._id]}}).then(function(count){
    article.upvotesCount = count;
    return article.save();
  });
};

// Update the number of downvotes on the article
ArticleSchema.methods.updateDownvoteCount = function() {
  let article = this;
  return User.count({articleDownvotes: {$in: [article._id]}}).then(function(count){
    article.downvotesCount = count;
    return article.save();
  });
};

// When a user change has vote from upvote to downvote, or from downvote to upvote,
// both the numbers of upvotes and downvotes need to be updated
ArticleSchema.methods.updateUpDownvoteCount = function() {
  let article = this;

  return User.count({articleUpvotes: {$in: [article._id]}}).then(function(countUp){
    article.upvotesCount = countUp;

    return User.count({articleDownvotes: {$in: [article._id]}}).then(function(countDown){
      article.downvotesCount = countDown;
      return article.save();
    });
  });
};

ArticleSchema.methods.toJSONFor = function(user){
  return {
    slug: this.slug,
    title: this.title,
    image: this.image,
    imgs: this.imgs,
    description: this.description,
    body: this.body,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    tagList: this.tagList,
    upvoted: user ? user.isArticleUpvote(this._id) : false,
    downvoted: user ? user.isArticleDownvote(this._id) : false,
    upvotesCount: this.upvotesCount,
    downvotesCount: this.downvotesCount,
    author: this.author.toProfileJSONFor(user)
  };
};

mongoose.model('Article', ArticleSchema);
