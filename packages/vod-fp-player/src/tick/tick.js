import { F, Tick, Maybe, Success, Empty, Logger } from 'vod-fp-utility';
import { ACTION, PROCESS, LOADPROCESS } from '../store';
import { getBufferInfo, getFlyBufferInfo } from '../buffer/buffer-helper';
import { findSegment, loadSegment, drainSegmentFromStore } from '../playlist/segment';
import { createMux } from '../mux/mux';
import { startBuffer } from '../buffer/buffer';
import { updateMediaDuration } from '../media/media';

const { prop, compose, map, curry } = F;

let logger = new Logger('player');


function main({ getState, getConfig, connect, dispatch, subOnce }, level, mediaSource) {
  logger.log(level);
  if (!level) return;
  connect(updateMediaDuration);
  connect(createMux);
  connect(startBuffer);
  let media = getState(ACTION.MEDIA.MEDIA_ELE);
  let startLoadProcess = connect(_startLoadProcess);

  function _checkBuffer() {
    let restBuffer = media.map(m => connect(getBufferInfo)(m.currentTime, m.seeking));
    // real buffer
    Maybe.of(curry((bufferInfo, media, pro, segments) => {
      if (bufferInfo.bufferLength < getConfig(ACTION.CONFIG.MAX_BUFFER_LENGTH) && pro === PROCESS.IDLE) {
        return connect(findSegment)(segments, bufferInfo.bufferEnd)
      } else if (media.paused || media.end) {
        dispatch(ACTION.MAIN_LOOP_HANDLE, 'stop')
      }
    }))
      .ap(restBuffer)
      .ap(media)
      .ap(getState(ACTION.PROCESS))
      .ap(getState(ACTION.PLAYLIST.SEGMENTS))
      .map(connect(drainSegmentFromStore))
      .getOrElse(e => {
        logger.log('continue check buffer');
      });
  }

  function _checkDownload(nextTick) {
    let restBuffer = media.map(m => connect(getBufferInfo)(m.currentTime, m.seeking));
    let flyRestBuffer = Maybe.of(curry((rest, m) => {
      return connect(getFlyBufferInfo)(rest.bufferEnd, true)
    }))
      .ap(restBuffer)
      .ap(media);

    // fly buffer 
    Maybe.of(curry((flyBuffer, media, loadProcess) => {
      let MAX_FLY_BUFFER_LENGTH = getConfig(ACTION.CONFIG.MAX_FLY_BUFFER_LENGTH);
      if (flyBuffer.bufferLength > MAX_FLY_BUFFER_LENGTH || loadProcess === LOADPROCESS.SEGMENT_LOADING) return;
      return flyBuffer;
    }))
      .ap(flyRestBuffer)
      .ap(media)
      .ap(getState(ACTION.LOADPROCESS))
      .map(flyBuffer => {
        subOnce(ACTION.LOADPROCESS, () => {
          nextTick()
        })
        return flyBuffer
      })
      .map(startLoadProcess)
      .getOrElse(e => {
        logger.log(e || 'continue check load');
        nextTick(300)
      });
  }


  let t = Tick.of()
    .addTask(_checkBuffer)
    .addTask(_checkDownload, true)
    .interval(getConfig(ACTION.CONFIG.TICK_INTERVAL))
    .immediateRun();
  dispatch(ACTION.MAIN_LOOP, t);
}


function _startLoadProcess({ getState, getConfig, dispatch, connect }, bufferInfo) {
  return getState(ACTION.PLAYLIST.SEGMENTS)
    .map(x => connect(findSegment)(x, bufferInfo.bufferEnd))
    .map(segment => {
      logger.groupEnd();
      logger.group(
        'current segment ',
        segment.id,
        ' of level ',
        segment.levelId || 1
      );
      connect(loadSegment)(segment);
      return true;
    })
    .getOrElse(Empty.of('no found segement'));
}

_startLoadProcess = curry(_startLoadProcess);
const startTick = F.curry(main);

export { startTick };
