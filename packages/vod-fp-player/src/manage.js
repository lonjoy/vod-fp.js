import { Task, F, Logger } from 'vod-fp-utility';
import { ACTION, PROCESS } from './store';
import { createMediaSource, destroyMediaSource } from './media/media';
import { loadPlaylist, changePlaylistLevel } from './playlist/playlist';
import { loadInitMP4 } from './playlist/segment';
import { startTick } from './tick/tick';
import {
  abortLoadingSegment,
  findSegmentOfCurrentPosition
} from './playlist/segment';
import { flushBuffer, abortBuffer } from './buffer/buffer';

let logger = new Logger('player');

function manage({ dispatch, connect }, media, url) {
  Task.resolve(connect(startTick))
    .ap(connect(loadPlaylist)(url))
    .ap(connect(createMediaSource)(media))
    .error(e => {
      // handle 那些非显示 emit 自定义error的运行时异常
      dispatch(ACTION.ERROR, e);
    });
}

function changeLevel() {
  let unSubChanged;
  let unSubChangedError;
  let unSubProcess;
  return F.curry(
    ({ connect, getState, dispatch, subscribe, subOnce, offSub }, levelId) => {
      offSub(unSubChanged);
      offSub(unSubChangedError);
      offSub(unSubProcess);

      let media = getState(ACTION.MEDIA.MEDIA_ELE);

      unSubChanged = subOnce(ACTION.EVENTS.LEVEL_CHANGED, levelId => {
        dispatch(ACTION.PROCESS, PROCESS.LEVEL_CHANGED);
        logger.log('level changed to ', levelId);
        let flushStart = connect(findSegmentOfCurrentPosition)
          .map(x => x.start || 0)
          .join();
        let resume = () => {
          media.map(x => {
            dispatch(ACTION.PROCESS, PROCESS.IDLE);
            dispatch(ACTION.MAIN_LOOP_HANDLE, 'resume');
            x.play();
          });
        };
        connect(flushBuffer)(flushStart, Infinity).map(() => {
          dispatch(ACTION.FLYBUFFER.REMOVE_SEGMENT_FROM_STORE);
          media.map(m => m.pause());
          if (getState(ACTION.PLAYLIST.FORMAT) === 'fmp4') {
            connect(loadInitMP4);
            subOnce(PROCESS.INIT_MP4_LOADED, () => {
              resume();
            });
            return;
          }
          resume();
        });
      });

      unSubChangedError = subOnce(ACTION.EVENTS.LEVEL_CHANGED_ERROR, e => {
        dispatch(ACTION.PROCESS, PROCESS.IDLE);
      });

      connect(abortLoadingSegment);
      dispatch(ACTION.MAIN_LOOP_HANDLE, 'stop');
      getState(ACTION.PROCESS).map(pro => {
        if (pro === PROCESS.IDLE) {
          dispatch(ACTION.PROCESS, PROCESS.LEVEL_CHANGING);
          connect(changePlaylistLevel)(levelId);
          return;
        }
        unSubProcess = subOnce(PROCESS.IDLE, pro => {
          dispatch(ACTION.PROCESS, PROCESS.LEVEL_CHANGING);
          connect(changePlaylistLevel)(levelId);
        });
      });
    }
  );
}

function destroy({ connect, dispatch }) {
  logger.log('destroy...');
  connect(abortLoadingSegment);
  connect(abortBuffer);
  connect(destroyMediaSource);
  dispatch(ACTION.MAIN_LOOP_HANDLE, 'stop');
}

manage = F.curry(manage);
destroy = F.curry(destroy);
export { manage, changeLevel, destroy };
