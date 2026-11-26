import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = () =>
  Promise.resolve({
    redirect: { destination: "/", permanent: false },
  });

const DashboardsPage = () => null;

export default DashboardsPage;
