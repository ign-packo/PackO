module.exports = {
  apps: [{
    name: 'packo',
    script: 'serveur.js',
    args: '-p 8081',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    env_development: {
      NODE_ENV: 'development',
    },
  }],
};
