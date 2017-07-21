function clearState (user){
  user.pendingState = {
    subject: "",
    date: "",
    time: "",
    invitees: [],
    inviteesBySlackid: [],
  };
  user.save(function(err){
    if(err)console.log(err);
  });
}

module.exports = {
  clearState,
  
}
