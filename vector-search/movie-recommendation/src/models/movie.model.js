// src/models/movie.model.js
//
// Model pattern — single source of truth for what a Movie object looks like.
// No DB yet. When a DB is added later, this becomes the ORM model.

class Movie {
  constructor({ movie_name, description, url, embedding = null }) {
    this.movie_name  = movie_name;
    this.description = description;
    this.url         = url;
    this.embedding   = embedding; // number[] | null — populated after seeding
  }
}

module.exports = Movie;
