const bcrypt = require("bcrypt");

bcrypt.hash("Fil@M@nag@r@2025#", 10).then(hash => {
  console.log(hash);
});
