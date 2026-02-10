import Header from './header';

const Layout = ({ children, onRefresh, refreshing }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header onRefresh={onRefresh} refreshing={refreshing} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            Cloud Hub Manager v0.1.0 - Desenvolvido com ❤️
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;