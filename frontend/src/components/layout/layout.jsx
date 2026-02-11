import Header from './header';
import Sidebar from './sidebar';

const Layout = ({ children, onRefresh, refreshing }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header onRefresh={onRefresh} refreshing={refreshing} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 px-6 py-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
