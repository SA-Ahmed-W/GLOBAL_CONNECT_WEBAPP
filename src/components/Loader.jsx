import React from 'react';

const Loader = () => {
  return (
    <div className="text-center h-screen w-full flex justify-center items-center">
      <div>
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-blue-600 mx-auto" />
        <h2 className="text-zinc-900 dark:text-white mt-4">Loading...</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Your adventure is about to begin
        </p>
      </div>
    </div>
  );
}

export default Loader;
