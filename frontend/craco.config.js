const devServerHost = process.env.HOST || '0.0.0.0';

module.exports = {
  devServer: {
    host: devServerHost,
    allowedHosts: 'all',
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