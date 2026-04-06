import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { Library } from './components/Library.js';

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center">
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <Library />
      </SignedIn>
    </>
  );
}
