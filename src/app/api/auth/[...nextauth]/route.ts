import NextAuth from 'next-auth';
import GithubProvider from 'next-auth/providers/github';

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
      authorization: {
        params: {
          scope: 'read:user user:email repo read:org read:repo_status write:repo_status'
        },
      },
    }),
  ],
  pages: {
    signIn: '/',
    error: '/', // Redirect to home page on error
  },
  callbacks: {
    async session({ session, token }) {
      if (token.accessToken) {
        session.accessToken = token.accessToken as string;
      }
      if (token.login && session.user) {
        session.user.login = token.login as string;
      }
      return session;
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile && (profile as any).login) {
        token.login = (profile as any).login;
      }
      return token;
    },
  },
  debug: process.env.NODE_ENV === 'development',
});

export { handler as GET, handler as POST }; 