import 'dotenv/config'
import { loadEnv } from '../config/env.js'
import { fetchLatestOfficialAccountPosts } from '../services/official-account.js'

const env = loadEnv(process.env)

if (!env.WECHAT_OA_APP_ID || !env.WECHAT_OA_APP_SECRET) {
  throw new Error('WECHAT_OA_APP_ID / WECHAT_OA_APP_SECRET are not configured')
}

console.log('✓ official account credentials are configured')

try {
  const posts = await fetchLatestOfficialAccountPosts(env)

  console.log('✓ official account access_token and publish API are reachable')
  console.log(`✓ published posts fetched: ${posts.length}`)

  for (const post of posts.slice(0, 10)) {
    console.log(
      [
        post.publishedAt?.toISOString() ?? '-',
        post.title,
        post.articleUrl ?? '-',
      ].join('\t'),
    )
  }

  if (posts.length === 0) {
    console.log(
      '! API call succeeded but returned 0 posts. Check whether recent service-account content is in the published/freepublish list rather than another message history category.',
    )
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)

  console.error('✗ official account sync test failed')
  console.error(message)

  if (message.includes('official_account_token_40164')) {
    console.error(
      'Hint: WeChat rejected the caller IP. Add this machine/server public egress IP to the service account API IP whitelist.',
    )
  } else if (message.includes('official_account_token_')) {
    console.error(
      'Hint: access_token acquisition failed. Re-check the service account AppID/AppSecret and account status.',
    )
  } else if (message.includes('official_account_publish_')) {
    console.error(
      'Hint: access_token works, but the publish API failed. Check the service account API permissions / published-content capability.',
    )
  }

  process.exitCode = 1
}
