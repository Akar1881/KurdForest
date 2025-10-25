const resetTokens = {};

function storeResetToken(token, tokenData) {
  resetTokens[token] = {
    ...tokenData,
    timestamp: Date.now(),
  };
}

function getResetToken(token) {
  return resetTokens[token];
}

function removeResetToken(token) {
  delete resetTokens[token];
}

module.exports = {
  storeResetToken,
  getResetToken,
  removeResetToken,
};