import fetch from 'node-fetch';
fetch('http://localhost:3000/api/auth/me')
  .then(res => res.text())
  .then(text => console.log(text))
  .catch(err => console.error(err));
