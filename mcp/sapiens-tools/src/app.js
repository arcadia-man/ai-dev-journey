const express = require("express");
const path = require("node:path");
const apiRoutes = require("./routes/api.routes");

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", apiRoutes);

module.exports = app;