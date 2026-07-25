import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary for this platform.');

const root = resolve(import.meta.dirname, '..');
const source = (name) => join(root, 'audio', 'candidates', 'soundscape-sources', name);
const output = (name) => join(root, 'public', 'audio', name);

const tracks = [
  {
    id: 'soundscape-morning-mist-1',
    output: output('morning-mist-1.mp3'),
    inputArgs: ['-i', source('ethereal.mp3'), '-stream_loop', '-1', '-i', source('garden-birds.mp3')],
    filter: [
      '[0:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=10[main]',
      '[1:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=12,volume=0.14[amb]',
      '[main][amb]amix=inputs=2:duration=first:dropout_transition=3:normalize=0,highpass=f=35,lowpass=f=18000,afade=t=in:st=0:d=3[mix]',
    ].join(';'),
  },
  {
    id: 'soundscape-morning-mist-2',
    output: output('morning-mist-2.mp3'),
    duration: 600,
    inputArgs: ['-i', source('meditation-12.mp3'), '-stream_loop', '-1', '-i', source('rain-window.mp3')],
    filter: [
      '[0:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=10[main]',
      '[1:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=12,volume=0.1[amb]',
      '[main][amb]amix=inputs=2:duration=first:dropout_transition=3:normalize=0,highpass=f=35,lowpass=f=18000,afade=t=in:st=0:d=3[mix]',
    ].join(';'),
  },
  {
    id: 'soundscape-sea-of-clouds-1',
    output: output('sea-of-clouds-1.mp3'),
    inputArgs: ['-i', source('tuesday-night.mp3'), '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.12:r=44100'],
    filter: [
      '[0:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=10[main]',
      '[1:a]aformat=channel_layouts=stereo,highpass=f=90,lowpass=f=4200,volume=0.018[air]',
      '[main][air]amix=inputs=2:duration=first:dropout_transition=3:normalize=0,highpass=f=35,lowpass=f=18000,afade=t=in:st=0:d=3[mix]',
    ].join(';'),
  },
  {
    id: 'soundscape-sea-of-clouds-2',
    output: output('sea-of-clouds-2.mp3'),
    inputArgs: ['-i', source('outer-space.mp3'), '-i', source('shakuhachi-440hz.ogg')],
    filter: [
      '[0:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=10[main]',
      '[1:a]aresample=44100,loudnorm=I=-24:TP=-3:LRA=5,volume=0.055,afade=t=in:st=0:d=2,afade=t=out:st=6:d=2,asplit=2[f1][f2]',
      '[f1]adelay=65000|65000[p1]',
      '[f2]adelay=185000|185000[p2]',
      '[main][p1][p2]amix=inputs=3:duration=first:dropout_transition=3:normalize=0,highpass=f=35,lowpass=f=18000,afade=t=in:st=0:d=3[mix]',
    ].join(';'),
  },
  {
    id: 'soundscape-still-waters-1',
    output: output('still-waters-1.mp3'),
    duration: 480,
    inputArgs: ['-i', source('meditation-2.mp3'), '-stream_loop', '-1', '-i', source('swale.mp3')],
    filter: [
      '[0:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=10[main]',
      '[1:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=8,volume=0.12[water]',
      '[main][water]amix=inputs=2:duration=first:dropout_transition=3:normalize=0,highpass=f=35,lowpass=f=18000,afade=t=in:st=0:d=3[mix]',
    ].join(';'),
  },
  {
    id: 'soundscape-still-waters-2',
    output: output('still-waters-2.mp3'),
    inputArgs: ['-i', source('dipping-my-toe.mp3'), '-stream_loop', '-1', '-i', source('swale.mp3')],
    filter: [
      '[0:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=10[main]',
      '[1:a]aresample=44100,asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-3:LRA=8,lowpass=f=6000,volume=0.085[water]',
      '[main][water]amix=inputs=2:duration=first:dropout_transition=3:normalize=0,highpass=f=35,lowpass=f=18000,afade=t=in:st=0:d=3[mix]',
    ].join(';'),
  },
];

const requestedIds = new Set(process.argv.slice(2));
const selectedTracks = requestedIds.size === 0
  ? tracks
  : tracks.filter((track) => requestedIds.has(track.id));
if (selectedTracks.length !== (requestedIds.size || tracks.length)) {
  const known = new Set(tracks.map((track) => track.id));
  const unknown = [...requestedIds].filter((id) => !known.has(id));
  throw new Error(`Unknown soundscape id: ${unknown.join(', ')}`);
}

function run(args, { quiet = false } = {}) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-nostdin', '-loglevel', quiet ? 'info' : 'warning', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed:\n${result.stderr || result.stdout}`);
  }
  if (!quiet && result.stderr) process.stderr.write(result.stderr);
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function loudnessJson(file) {
  const report = run([
    '-i', file,
    '-af', 'loudnorm=I=-24:TP=-2:LRA=8:print_format=json',
    '-f', 'null',
    '-',
  ], { quiet: true });
  const blocks = [...report.matchAll(/\{[\s\S]*?"target_offset"\s*:\s*"[^"]+"[\s\S]*?\}/g)];
  if (blocks.length === 0) throw new Error(`Could not parse loudness report for ${file}`);
  return JSON.parse(blocks.at(-1)[0]);
}

function checksum(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const temp = mkdtempSync(join(tmpdir(), 'dishen-soundscapes-'));
const audit = [];

try {
  for (const track of selectedTracks) {
    const mixed = join(temp, `${track.id}.wav`);
    const durationArgs = track.duration ? ['-t', String(track.duration)] : [];
    run([
      '-y',
      ...track.inputArgs,
      '-filter_complex', track.filter,
      '-map', '[mix]',
      ...durationArgs,
      '-ar', '44100',
      '-ac', '2',
      '-c:a', 'pcm_s24le',
      mixed,
    ]);

    const measured = loudnessJson(mixed);
    const normalized = [
      'loudnorm=I=-24:TP=-2:LRA=8',
      `measured_I=${measured.input_i}`,
      `measured_LRA=${measured.input_lra}`,
      `measured_TP=${measured.input_tp}`,
      `measured_thresh=${measured.input_thresh}`,
      `offset=${measured.target_offset}`,
      'linear=true',
      'print_format=summary',
    ].join(':');

    run([
      '-y',
      '-i', mixed,
      '-af', normalized,
      '-ar', '44100',
      '-ac', '2',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-map_metadata', '-1',
      track.output,
    ], { quiet: true });

    const verified = loudnessJson(track.output);
    const bytes = statSync(track.output).size;
    if (bytes >= 12 * 1024 * 1024) throw new Error(`${track.id} exceeds 12 MiB.`);
    if (Number(verified.input_tp) > -1.9) throw new Error(`${track.id} exceeds the -2 dBTP target.`);
    audit.push({
      id: track.id,
      bytes,
      sha256: checksum(track.output),
      loudness: `${verified.input_i} LUFS / ${verified.input_tp} dBTP / LRA ${verified.input_lra} LU`,
    });
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
