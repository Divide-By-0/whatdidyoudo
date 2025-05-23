'use client';

import { useSession } from 'next-auth/react';
import GitHubSignIn from './GitHubSignIn';
import SignOut from './SignOut';

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="w-full py-4">
      <div className="max-w-4xl mx-auto px-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">What Did You Do?</h1>
        {session ? <SignOut /> : <GitHubSignIn />}
      </div>
    </header>
  );
} 