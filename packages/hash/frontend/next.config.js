module.exports = {
  async redirects() {
    return [
      {
        source: "/",
        // @todo set this correctly
        destination: "/2/page1",
        permanent: false,
      },
    ];
  },
};
