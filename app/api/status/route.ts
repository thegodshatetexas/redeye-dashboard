import * as dns from 'node:dns/promises'
import * as tls from 'node:tls'
import { SESClient, GetIdentityVerificationAttributesCommand } from '@aws-sdk/client-ses'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface DnsEntry {
  domain: string
  provider: string
  expected: 'route53' | 'pending' | 'unknown'
  nameservers: string[]
  status: 'ok' | 'pending' | 'error'
  error?: string
}

interface SslEntry {
  domain: string
  validTo: string | null
  daysRemaining: number | null
  warning: boolean
  error?: string
}

interface SesEntry {
  identity: string
  region: string
  verificationStatus: string | null
  error?: string
}

interface StatusData {
  dns: DnsEntry[]
  ssl: SslEntry[]
  ses: SesEntry[]
}

const DNS_DOMAINS: { domain: string; provider: string; expected: 'route53' | 'pending' }[] = [
  { domain: 'greghay.es', provider: 'Route53', expected: 'route53' },
  { domain: 'greghayes.com', provider: 'Route53', expected: 'route53' },
  { domain: 'greghayes.co', provider: 'Route53', expected: 'route53' },
  { domain: 'hayes-mfg.com', provider: 'Route53', expected: 'route53' },
  { domain: 'thegodshatetexas.com', provider: 'Route53', expected: 'route53' },
]

const SSL_DOMAINS = [
  'concerts.redeye.dev',
  'happyhour.redeye.dev',
  'mods.redeye.dev',
  'greghay.es',
  'greghayes.com',
  'greghayes.co',
  'hayes-mfg.com',
  'thegodshatetexas.com',
]

const SES_IDENTITIES: { identity: string; region: string }[] = [
  { identity: 'redeye.dev', region: 'us-west-2' },
  { identity: 'redeye.dev', region: 'us-east-2' },
  { identity: 'redeye.studio', region: 'us-west-2' },
]

async function checkDns(domain: string, provider: string, expected: 'route53' | 'pending'): Promise<DnsEntry> {
  try {
    const nameservers = await dns.resolveNs(domain)
    const isRoute53 = nameservers.some((ns) => ns.includes('awsdns'))
    let status: 'ok' | 'pending' | 'error' = 'ok'
    if (expected === 'route53' && !isRoute53) status = 'pending'
    else if (expected === 'pending' && isRoute53) status = 'ok'
    return { domain, provider, expected, nameservers: nameservers.sort(), status }
  } catch (err) {
    return {
      domain,
      provider,
      expected,
      nameservers: [],
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function checkSsl(domain: string): Promise<SslEntry> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ domain, validTo: null, daysRemaining: null, warning: false, error: 'Timeout' })
    }, 8000)

    try {
      const socket = tls.connect(443, domain, { servername: domain, rejectUnauthorized: false }, () => {
        clearTimeout(timeout)
        try {
          const cert = socket.getPeerCertificate()
          socket.destroy()
          if (!cert || !cert.valid_to) {
            resolve({ domain, validTo: null, daysRemaining: null, warning: false, error: 'No cert' })
            return
          }
          const validTo = new Date(cert.valid_to)
          const daysRemaining = Math.round((validTo.getTime() - Date.now()) / 86400000)
          resolve({
            domain,
            validTo: cert.valid_to,
            daysRemaining,
            warning: daysRemaining < 30,
          })
        } catch (err) {
          resolve({ domain, validTo: null, daysRemaining: null, warning: false, error: String(err) })
        }
      })
      socket.on('error', (err) => {
        clearTimeout(timeout)
        socket.destroy()
        resolve({ domain, validTo: null, daysRemaining: null, warning: false, error: err.message })
      })
    } catch (err) {
      clearTimeout(timeout)
      resolve({ domain, validTo: null, daysRemaining: null, warning: false, error: String(err) })
    }
  })
}

async function checkSes(identity: string, region: string): Promise<SesEntry> {
  try {
    const client = new SESClient({ region })
    const cmd = new GetIdentityVerificationAttributesCommand({ Identities: [identity] })
    const result = await client.send(cmd)
    const attr = result.VerificationAttributes?.[identity]
    return {
      identity,
      region,
      verificationStatus: attr?.VerificationStatus ?? null,
    }
  } catch (err) {
    return {
      identity,
      region,
      verificationStatus: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET(): Promise<NextResponse<StatusData | { error: string }>> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [dnsResults, sslResults, sesResults] = await Promise.all([
    Promise.all(DNS_DOMAINS.map((d) => checkDns(d.domain, d.provider, d.expected))),
    Promise.all(SSL_DOMAINS.map((d) => checkSsl(d))),
    Promise.all(SES_IDENTITIES.map((s) => checkSes(s.identity, s.region))),
  ])

  return NextResponse.json({ dns: dnsResults, ssl: sslResults, ses: sesResults })
}
