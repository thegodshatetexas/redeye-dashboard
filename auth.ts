import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const ALLOWED_EMAIL = 'greg@redeyedev.io'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  cookies: {
    sessionToken: {
      name: 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: true,
        // Shared across all *.redeye.dev subdomains
        domain: process.env.SESSION_COOKIE_DOMAIN ?? undefined,
      },
    },
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    signIn({ profile }) {
      return profile?.email === ALLOWED_EMAIL
    },
  },
})
