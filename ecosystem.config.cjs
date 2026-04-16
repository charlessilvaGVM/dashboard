module.exports = {
  apps: [
    {
      name: 'gvm-backend',
      cwd: './backend',
      script: 'server.js',
      watch: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'gvm-frontend',
      script: './start-frontend.js',
      watch: false,
      env: { NODE_ENV: 'development' },
    },
  ],
};
