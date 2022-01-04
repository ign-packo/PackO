const path = require('path');

const mode = process.env.NODE_ENV;

module.exports = {
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/dist',
    filename: 'bundle.js',
  },
  mode,
  devServer: {
    port: 8000,
    // publicPath: '/dist',
    static: path.resolve(__dirname, './'),
    devMiddleware: {
      publicPath: '/dist',
    },
  },
};

if (mode === 'development') {
  module.exports.devtool = 'inline-source-map';
}
