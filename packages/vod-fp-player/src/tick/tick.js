import { F, Tick, Maybe, Success, Empty, Logger } from 'vod-fp-utility';
import { ACTION, PROCESS } from '../store';
import { getBufferInfo } from '../buffer/buffer-helper';
import { findSegment, loadSegment } from '../playlist/segment';
import { createMux } from '../mux/mux';
import { startBuffer } from '../buffer/buffer';
import { updateMediaDuration } from '../media/media';

const { prop, compose, map, curry } = F;

let logger = new Logger('player');

function _loadCheck({ dispatch, getConfig }, bufferInfo, process, media) {
  let MAX_BUFFER_LENGTH = getConfig(ACTION.CONFIG.MAX_BUFFER_LENGTH);
  if (
    bufferInfo.bufferLength > MAX_BUFFER_LENGTH ||
    (process !== PROCESS.IDLE && process !== PROCESS.PLAYLIST_LOADED) ||
    media.ended
  ) {
    if (
      bufferInfo.bufferLength > MAX_BUFFER_LENGTH &&
      (media.paused || media.ended)
    ) {
      dispatch(ACTION.MAIN_LOOP_HANDLE, 'stop');
    }
    return;
  }
  return bufferInfo;
}

function _startProcess({ getState, dispatch, connect }, rest) {
  let segments = getState(ACTION.PLAYLIST.SEGMENTS);
  let segment = segments.map(x => connect(findSegment)(x, rest.bufferEnd));
  return Maybe.of(
    curry((segment, segments, currentId) => {
      if (currentId === segment.id) {
        segment = segments[currentId + 1];
        logger.warn(`segment ${currentId} 已下载,下载下一分片`);
      }
      return segment;
    })
  )
    .ap(segment)
    .ap(segments)
    .ap(getState(ACTION.PLAYLIST.CURRENT_SEGMENT_ID))
    .map(segment => {
      logger.groupEnd();
      logger.group(
        'current segment ',
        segment.id,
        ' of level ',
        segment.levelId || 1
      );
      logger.log('restBuffer: ', rest);
      dispatch(ACTION.PLAYLIST.CURRENT_SEGMENT_ID, segment.id);
      connect(loadSegment)(segment);
      return true;
    })
    .getOrElse(Empty.of('no found segement'));
}

function tick({ getState, getConfig, connect, dispatch }, level, mediaSource) {
  if (!level) return;
  connect(updateMediaDuration);
  connect(createMux);
  connect(startBuffer);
  let timer = null;
  let media = getState(ACTION.MEDIA.MEDIA_ELE);
  let startProcess = connect(_startProcess);
  let check = connect(_loadCheck);

  function _startTimer() {
    let rest = map(
      compose(
        connect(getBufferInfo),
        prop('seeking')
      )
    )(media);
    Maybe.of(check)
      .ap(rest)
      .ap(getState(ACTION.PROCESS))
      .ap(media)
      .map(startProcess)
      .getOrElse(e => {
        logger.log(e || 'continue check');
      });
  }

  let t = Tick.of(_startTimer)
    .interval(getConfig(ACTION.CONFIG.TICK_INTERVAL))
    .immediate();
  dispatch(ACTION.MAIN_LOOP, t);
}

_loadCheck = curry(_loadCheck);
_startProcess = curry(_startProcess);
const startTick = F.curry(tick);

export { startTick };
