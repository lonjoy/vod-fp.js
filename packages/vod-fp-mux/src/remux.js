// const console = {};
// console.log = window.log;

import MP4 from './Mp4Box';

const logger = {
  log: console.log.bind(console)
};

let nextAvcDts = 0;
let _initDts = 0;

function remux(avcTrack) {
  let initSegment = MP4.initSegment([avcTrack]);
  logger.log('avcTrack', avcTrack);
  // logger.log('initSegment: ', initSegment);
  let samples = avcTrack.samples;
  let nbSamples = samples.length;
  if (!_initDts) {
    _initDts = avcTrack.samples[0].dts;
  }
  samples.forEach(sample => {
    sample.pts = ptsNormalize(sample.pts - _initDts, nextAvcDts);
    sample.dts = ptsNormalize(sample.dts - _initDts, nextAvcDts);
  });
  // logger.log(samples);
  // 按dts排序
  samples.sort(function (a, b) {
    const deltadts = a.dts - b.dts;
    const deltapts = a.pts - b.pts;
    return deltadts || deltapts;
  });

  console.log('samples', samples);

  let sample = samples[0];
  let firstDTS = Math.max(sample.dts, 0);
  let firstPTS = Math.max(sample.pts, 0);

  sample = samples[samples.length - 1];
  let lastDTS = Math.max(sample.dts, 0);
  let lastPTS = Math.max(sample.pts, 0, lastDTS);

  let nbNalu = 0;
  let accessUnitsLen = 0;
  for (let i = 0; i < nbSamples; i++) {
    // compute total/avc sample length and nb of NAL units
    let sample = samples[i];
    let units = sample.units;
    let nbUnits = units.length;
    let sampleLen = 0;
    for (let j = 0; j < nbUnits; j++) {
      sampleLen += units[j].data.length;
    }

    accessUnitsLen += sampleLen;
    nbNalu += nbUnits;
    sample.length = sampleLen;
    sample.pts = Math.max(sample.pts, sample.dts);
  }

  let mdatSize = accessUnitsLen + 4 * nbNalu + 8;
  let mdat = new Uint8Array(mdatSize);
  let view = new DataView(mdat.buffer);
  view.setUint32(0, mdatSize); // mdatSize 占 4byte
  mdat.set(MP4.types.mdat, 4);

  let offset = 8;
  let mp4SampleDuration;
  let compositionTimeOffset;
  let mp4Samples = [];
  for (let i = 0; i < nbSamples; i++) {
    let avcSample = samples[i];
    let avcSampleUnits = avcSample.units;
    let mp4SampleLength = 0;
    let compositionTimeOffset;
    // convert NALU bitstream to MP4 format (prepend NALU with size field)
    for (let j = 0, nbUnits = avcSampleUnits.length; j < nbUnits; j++) {
      let unit = avcSampleUnits[j];
      let unitData = unit.data;
      let unitDataLen = unit.data.byteLength;
      view.setUint32(offset, unitDataLen);
      offset += 4;
      mdat.set(unitData, offset);
      offset += unitDataLen;
      mp4SampleLength += 4 + unitDataLen;
    }
    if (i < nbSamples - 1) {
      mp4SampleDuration = samples[i + 1].dts - avcSample.dts;
    } else {
      let lastFrameDuration = avcSample.dts - samples[i > 0 ? i - 1 : i].dts;
      mp4SampleDuration = lastFrameDuration;
    }
    compositionTimeOffset = Math.round(avcSample.pts - avcSample.dts);

    mp4Samples.push({
      size: mp4SampleLength,
      // constant duration
      duration: mp4SampleDuration,
      cts: compositionTimeOffset,
      flags: {
        isLeading: 0,
        isDependedOn: 0,
        hasRedundancy: 0,
        degradPrio: 0,
        dependsOn: avcSample.key ? 2 : 1,
        isNonSync: avcSample.key ? 0 : 1
      }
    });
  }
  console.log('mp4Samples', mp4Samples);
  nextAvcDts = lastDTS + mp4SampleDuration;
  avcTrack.samples = mp4Samples;
  let moof = MP4.moof(avcTrack.sequenceNumber++, firstDTS, avcTrack);
  // avcTrack.samples = [];
  // logger.log(moof);
  // logger.log(mdat);
  const bf = new Uint8Array(
    initSegment.byteLength + moof.byteLength + mdat.byteLength
  );
  bf.set(initSegment, 0);
  bf.set(moof, initSegment.byteLength);
  bf.set(mdat, initSegment.byteLength + moof.byteLength);
  return bf;
}

function geneSample() {}

function ptsNormalize(value, reference) {
  let offset;
  if (reference === undefined) {
    return value;
  }

  if (reference < value) {
    // - 2^33
    offset = -8589934592;
  } else {
    // + 2^33
    offset = 8589934592;
  }
  /* PTS is 33bit (from 0 to 2^33 -1)
    if diff between value and reference is bigger than half of the amplitude (2^32) then it means that
    PTS looping occured. fill the gap */
  while (Math.abs(value - reference) > 4294967296) {
    value += offset;
  }

  return value;
}

export default remux;