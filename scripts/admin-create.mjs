import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { stdin, stdout } from 'node:process'
import { createStore } from '../server/create-store.mjs'
import { hashPassword } from '../server/auth.mjs'
import { configuration } from '../server/config.mjs'
import { MiaodaSql } from '../server/miaoda-client.mjs'
import { MiaodaRepository } from '../server/miaoda-repository.mjs'

if (!stdin.isTTY) throw new Error('请在本机交互式终端运行；不要通过聊天或命令行参数提供密码')
let hidden = false
const output = new Writable({ write(chunk, encoding, done) { if (!hidden) stdout.write(chunk, encoding); done() } })
const rl = createInterface({ input: stdin, output, terminal: true })
let store
try {
  const username = (await rl.question('管理员账号（默认 admin）：')).trim() || 'admin'
  if (username.length > 100) throw new Error('账号不能超过 100 个字符')
  const config = configuration()
  if (config.storage === 'miaoda-remote') {
    stdout.write('将设置正式云端后台的管理员，需要当前妙搭账号拥有数据库管理权限。\n')
    const repository = new MiaodaRepository(new MiaodaSql({ appId: config.miaoda.appId, env: 'online' }))
    store = { getAdmin: () => repository.getAdmin(), setAdmin: (...args) => repository.setAdmin(...args), close() {} }
  } else store = await createStore(config)
  if (await store.getAdmin()) {
    const confirm = await rl.question('已有管理员，继续会更换密码并退出所有会话。输入 YES 确认：')
    if (confirm !== 'YES') throw new Error('已取消，不修改管理员')
  }
  stdout.write('设置密码（至少 12 位，输入不显示）：')
  hidden = true
  const password = await rl.question('')
  hidden = false
  stdout.write('\n再次输入密码：')
  hidden = true
  const repeated = await rl.question('')
  hidden = false
  stdout.write('\n')
  if (password !== repeated) throw new Error('两次密码不一致，未保存')
  await store.setAdmin(username, await hashPassword(password))
  console.log('管理员已设置。打开网站的 /admin 登录；密码不会写入前端或日志。')
} finally { hidden = false; rl.close(); store?.close() }
