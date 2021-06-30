module.exports = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/2/page1",
        permanent: false,
      },
    ];
  },
};
