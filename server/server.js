require("dotenv").config();
const app = require("./src/app"); //sets up express app
const pool = require("./src/config/db"); //sets up database connection

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} \nhttp://localhost:${PORT}`);
});