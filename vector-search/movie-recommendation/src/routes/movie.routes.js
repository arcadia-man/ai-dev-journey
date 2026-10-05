// src/routes/movie.routes.js
const express = require("express");
const router  = express.Router();
const movieController = require("../controllers/movie.controller");

router.get("/",          movieController.listMovies);
router.post("/recommend", movieController.recommendMovies);

module.exports = router;
