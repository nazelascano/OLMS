module.exports = {
  devServer: {
    host: '127.0.0.1',
    allowedHosts: 'all',
    client: {
      webSocketURL: {
        hostname: '127.0.0.1',
      },
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      // Suppress noisy source map parse warnings from some third-party packages
      webpackConfig.ignoreWarnings = webpackConfig.ignoreWarnings || [];
      webpackConfig.ignoreWarnings.push(/Failed to parse source map/);
      return webpackConfig;
    },
  },
};