'use strict';


var mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
var {web, rtm, taskPath} = require('./bot');
var  {User, Reminder, Meeting} = require('./models');

//extras

var axios = require('axios');
var moment = require('moment');
var _ = require('underscore');
moment().format();

//express

var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

//google

var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;
function getGoogleAuth() {
  return new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.DOMAIN + '/connect/callback'
  );
}

// functions

var {clearState} = require('./functions.js');

app.get('/connect', function(req, res){
  var userId = req.query.auth_id;
  if (!userId) {
    res.status(400).send("Missing user id");
  } else {
    User.findById(userId)
    .then(function(user){
      if (!user) {
        res.status(404).send("Cannot find user");
      }
      else {
        var googleAuth = getGoogleAuth();
        var url = googleAuth.generateAuthUrl({
          access_type: 'offline',     //'online' (default) or 'offline' (gets refresh_token)
          prompt: 'consent',
          scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/calendar',
            'email'
          ],    // generate a url that asks permissions for Google+ and Google Calendar scopes
          state: userId
        });
        res.redirect(url);
      }
    })
  }
})

var bluebird = require('bluebird');
var moment = require('moment');
var calendar = google.calendar('v3');
var eventInsert = bluebird.promisify(calendar.events.insert.bind(calendar.events));
var plus = google.plus('v1');
var peopleGet = bluebird.promisify(plus.people.get.bind(plus.people));

app.get('/connect/callback', function(req, res){
  var googleAuth = getGoogleAuth();
  var getToken = bluebird.promisify(googleAuth.getToken.bind(googleAuth));
  var tokens;
  var googleUser;
  getToken(req.query.code)
  .then(function(t) {
    console.log("HERE ARE THE TOKENS", t);    // Now tokens contains an access_token and an optional refresh_token. Save them.
    tokens = t;
    googleAuth.setCredentials(tokens);
    return peopleGet({auth: googleAuth, userId: 'me'});
  })
  .then(function(g) {
    googleUser = g;
    return User.findById(req.query.state);
  })
  .then(function(mongoUser) {
    mongoUser.googleAccount = tokens;
    mongoUser.googleAccount.profile_ID = googleUser.id;
    mongoUser.googleAccount.profile_name = googleUser.displayName;
    return mongoUser.save();
  })
  .then(function(mongoUser){
    res.send('You are connected to Google Calendar');    //To /connect/callback webpage
    rtm.sendMessage('You are connected to Google Calendar. Now set your first reminder by talking to me!', mongoUser.slack_DM_ID)    //To slack channel
  })
  .catch(function(err){
    res.status(500).json({error: err});
  })
})

app.post('/bot-test', function(req, res){

  var payload = JSON.parse(req.body.payload);

  // cancelled the reuqest

  if(payload.actions[0].value === "cancel"){
      User.findOne({slack_ID: payload.user.id})
      .then(function(user){
        clearState(user)
      })
      res.send("Your request has been cancelled. " + ':pray: :100: :fire:');
  }

  // accepted request

  else{
    var curTime = Date.now();
    User.findOne({slack_ID: payload.user.id})
    .then(function(user){

      //refresh access token
      console.log("checking refresh");
      if(curTime > user.googleAccount.expiry_date){
        console.log("refreshing token");
        var googleAuth = getGoogleAuth();
        googleAuth.setCredentials(user.googleAccount);
        return googleAuth.refreshAccessToken(function(err, tokens){
          user.googleAccount = Object.assign({},user.googleAccount, tokens);
          return user.save(function(){
            return user;
          })
        })
      }

      //access token is valid

      else{
        console.log("no refresh has been done");
        return user;
      }

    })
    .then(function(user){

      // task path
      console.log("checking which path to take");

      if(user.pendingState.invitees.length === 0){
        console.log("task path taken");
        taskPath(user)
        .then(flag => {
            if(flag){
              clearState(user);
              res.send("Task has been added to your calendar " + ':pray: :100: :fire:');
            }
            else{
              clearState(user);
              res.send("Failed to post task to calendar")
            }
        })
      }

      // meeting path

      else{
        res.send("dont choose the meeting path yet");
      }


    })
  }

})

app.listen(3000);
rtm.start();
