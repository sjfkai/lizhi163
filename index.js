import util from 'util'
import readline from 'readline'
import chalk from 'chalk'
import got from 'got'
import { createRequire } from 'module'
import { readFile, writeFile } from 'fs/promises'

import songs from './songs.js'


const require = createRequire(import.meta.url);
const { login_cellphone, cloud } = require('NeteaseCloudMusicApi')

const sleep = (ms) => new Promise(resolve => setTimeout(() => resolve(), ms))

let completedSongs = []

async function loadCompletedSongs() {
  try {
    const cache = await readFile(new URL('./.cache/completed', import.meta.url), { encoding: 'utf-8' })
    completedSongs = cache.split('\n')
  } catch {}
}

async function saveCompletedSongs() {
  const cache = completedSongs.join('\n')
  await writeFile(new URL('./.cache/completed', import.meta.url), cache, { encoding: 'utf-8' })
}

async function loadCookie() {
  try {
    const cookie = await readFile(new URL('./.cache/cookie', import.meta.url), { encoding: 'utf-8' })
    return cookie
  } catch {}
}

async function saveCookie(cookie) {
  await writeFile(new URL('./.cache/cookie', import.meta.url), cookie, { encoding: 'utf-8' })
}

async function uploadSong(srcUrl, cookie) {
  if (completedSongs.includes(srcUrl)) {
    return
  }
  const fileName = srcUrl.split('/').pop()
  console.log('正在下载', fileName)
  const songBuffer = await got(srcUrl).buffer()
  console.log('下载完成', fileName)
  console.log('正在上传', fileName)
  try {
    await cloud({
      songFile: {
        name: fileName,
        data: songBuffer,
      },
      cookie,
    })
  } catch (error) {
    console.log('上传失败，等10秒重试一次', fileName)
    await sleep(10000)
    await cloud({
      songFile: {
        name: fileName,
        data: songBuffer,
      },
      cookie,
    })
  }
  console.log(chalk.red('上传完成'), fileName)
  completedSongs.push(srcUrl)
}

function uploadSongs(cookie) {
  const copySongs = [...songs]
  const uploadNext = () => {
    if (!copySongs.length) {
      return Promise.resolve()
    }
    const song = copySongs.pop()
    console.log(songs.length - copySongs.length, '/', songs.length)
    return uploadSong(song.url, cookie).then(uploadNext)
  }
  return Promise.all([
    uploadNext(),
    uploadNext(),
    uploadNext(),
  ])
}

async function main() {
  await loadCompletedSongs()

  let cookie = await loadCookie()
  if (!cookie) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  
    const question = util.promisify(rl.question).bind(rl)
  
    const phone = await question(chalk.blue('请输入手机号:'))
    const password = await question(chalk.blue('请输入密码:'))
  
    if (!phone || !password) {
      console.error(`手机号或密码不能为空`)
      process.exit()
    }
    console.log('正在登陆…')
    // 登陆
    const result = await login_cellphone({
      phone,
      password,
    })
    if (result.body.code !== 200) {
      console.error(`登陆失败`, result.body)
      process.exit()
    }
    // 登陆成功
    console.log('登陆成功')
    cookie = result.body.cookie
    await saveCookie(cookie)
    rl.close()
  }

  // 准备上传
  const songUrl = songs[0].url
  await uploadSongs(cookie)
  await saveCompletedSongs()
}
main().catch(async e => {
  console.error(e)
  await saveCompletedSongs()
  process.exit()
})
