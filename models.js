var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
  googleAccount: {
    access_token: String,
    refresh_token: String,
    profile_ID: String,
    expiry_date: Number,
    email: String
  },
  pendingState: {
    subject: String,
    date: String,
    invitees: Array,
    inviteesBySlackid: Array,
    time: String,
  },
  slack_ID: String,
  slack_Username: String,
  slack_Email: String,
  slack_DM_ID: String
});

var reminderSchema = mongoose.Schema({
  // slack_DM_ID: String,
  subject: {
    //required: true,
    type: String
  },
  day: {
    //required: true,
    type: String
  },
  googCalID: String,
  reqID: String
})

var meetingSchema = mongoose.Schema({
  date: String,
  time: String,
  invitees: Array,
  subject: String,
  location: String,
  createdAt: String,
  reuesterId: String
})

var User = mongoose.model('User', userSchema);
var Reminder = mongoose.model('Reminder', reminderSchema);
var Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = {
    User: User,
    Reminder: Reminder,
    Meeting: Meeting,  
};
