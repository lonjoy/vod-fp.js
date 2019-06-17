import { F, Task, Success, Empty } from 'vod-fp-utility';
import { ACTION, PROCESS } from '../store';
import { toMux, setTimeOffset, resetInitSegment } from '../mux/mux';
import loader from '../loader/loader';

const { compose, head, map, filter } = F;

function binarySearch(list, start, end, bufferEnd) {
  // start mid end
  if (start > end) {
    return -1;
  }
  const mid = start + Math.floor((end - start) / 2);
  if (list[mid].end < bufferEnd + 0.25) {
    start = mid + 1;
    return binarySearch(list, start, end, bufferEnd);
  } else if (list[mid].start > bufferEnd + 0.25) {
    end = mid - 1;
    return binarySearch(list, start, end, bufferEnd);
  } else {
    return list[mid];
  }
  return -1;
}

const findSegment = F.curry((segments, bufferEnd) => {
  let seg = binarySearch(segments, 0, segments.length - 1, bufferEnd);
  if (seg === -1) {
    return;
  }
  return seg;
});

const abortCurrentSegment = F.curry(({ getState }) => {
  let currentSegmentUrl = getState(ACTION.PLAYLIST.CURRENT_SEGMENT).join().url;
  compose(
    map(x => x.xhr.abort()),
    map(head),
    map(filter(x => x.id === currentSegmentUrl))
  )(getState(ACTION.ABORTABLE));
});

// segment -> Task
function loadSegment() {
  let lastSegment = null;
  return ({ getState, connect, dispatch }, segment) => {
    return connect(loader)({
      url: segment.url,
      options: {
        responseType: 'arraybuffer'
        // timeout: 1500
      }
    })
      .map(buffer => {
        dispatch(ACTION.PROCESS, PROCESS.SEGMENT_LOADED);
        if (
          (lastSegment && lastSegment.cc !== segment.cc) ||
          (lastSegment && lastSegment.levelId !== segment.levelId)
        ) {
          connect(setTimeOffset)(segment.start);
          connect(resetInitSegment);
        }
        if (lastSegment && segment.id - lastSegment.id !== 1) {
          connect(setTimeOffset)(segment.start);
        }
        dispatch(ACTION.PROCESS, PROCESS.MUXING);
        connect(toMux)(buffer, segment.id);
        lastSegment = segment;
      })
      .filterRetry(x => x.message !== 'Abort')
      .retry(3, 1000)
      .error(e => {
        if (e.message === 'Abort') {
          dispatch(ACTION.PROCESS, PROCESS.IDLE);
          dispatch(ACTION.PLAYLIST.CURRENT_SEGMENT_ID, -1);
        } else {
          dispatch(ACTION.PROCESS, PROCESS.ERROR);
          dispatch(ACTION.EVENTS.ERROR, e);
        }
      });
  };
}
loadSegment = F.curry(loadSegment());

export { findSegment, loadSegment, abortCurrentSegment };
