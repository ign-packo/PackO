module.exports = {
  apps: [{
    name: 'packo',
    script: 'serveur.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
