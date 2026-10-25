import fs from 'node:fs'

const p = process.argv[2]
const m = JSON.parse(fs.readFileSync(p, 'utf8'))
const andr = m.fileMetadata?.android
if (andr) {
  andr.bundle = andr.bundle.replace(/\\/g, '/')
  for (const a of andr.assets) a.path = a.path.replace(/\\/g, '/')
}
fs.writeFileSync(p, JSON.stringify(m))
console.log('normalized bundle:', andr?.bundle)
console.log('normalized assets:', andr?.assets?.length)
