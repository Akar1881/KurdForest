
const tempUsers = {};

function storeTempUser(token, userData) {
  tempUsers[token] = {
    ...userData,
    timestamp: Date.now(),
  };
}

function getTempUser(token) {
  return tempUsers[token];
}

function removeTempUser(token) {
  delete tempUsers[token];
}

module.exports = {
  storeTempUser,
  getTempUser,
  removeTempUser,
};
