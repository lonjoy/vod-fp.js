import { Task, Fail, CusError, F } from 'vod-fp-utility';
import { ACTION } from '../store';
import { LOADER_ERROR } from '../error';

const { curry } = F;

const FETCH_BODY = {
  text: 'text',
  arraybuffer: 'arrayBuffer',
  json: 'json',
  blob: 'blob'
};

function _readerStream({ dispatch }, ts, reader) {
  let store = [];
  let tsStart = ts;
  let dump = () => {
    return reader.read().then(({ done, value }) => {
      if (done) {
        let totalLength = store.reduce((all, c) => {
          all += c.byteLength;
          return all;
        }, 0);
        let uint8Array = new Uint8Array(totalLength);
        let offset = 0;
        store.forEach(bf => {
          uint8Array.set(bf, offset);
          offset += bf.byteLength;
        });
        store = [];
        return {
          buffer: uint8Array.buffer,
          info: {
            tsLoad: performance.now() - tsStart,
            size: totalLength
          }
        };
      }
      store.push(value);
      let tsTick = performance.now() - ts;
      //单次时间 > 1ms 有效
      if (tsTick > 1) {
        dispatch(
          ACTION.PLAYLIST.COLLECT_DOWNLOAD_TIME,
          value.byteLength / (performance.now() - ts) / 1000
        );
      }
      ts = performance.now();
      return dump();
    });
  };
  return dump();
}
_readerStream = curry(_readerStream);

function fetchLoader({ connect }, config, controller, resolve, reject) {
  let { url, body, method, headers, options, params } = config;
  let cancelTimer;
  if (params.timeout) {
    cancelTimer = setTimeout(() => {
      console.warn('TIMEOUT');
      reject(CusError.of(LOADER_ERROR.LOAD_TIMEOUT));
      controller.abort();
    }, params.timeout);
  }
  let ts = performance.now();
  let reader = connect(_readerStream)(ts);

  fetch(url, {
    method,
    headers,
    signal: controller.signal,
    body,
    ...options
  })
    .then(res => {
      if (res.ok && (res.status >= 200 && res.status < 300)) {
        return res;
      }
      reject(
        CusError.of({
          ...LOADER_ERROR.LOAD_ERROR,
          code: res.status,
          message: res.statusText
        })
      );
    })
    .then(res => {
      if (config.useStream) {
        return reader(res.body.getReader());
      }
      return res[FETCH_BODY[params.responseType]]();
    })
    .then(res => {
      clearTimeout(cancelTimer);
      resolve(res);
    })
    .catch(e => {
      clearTimeout(cancelTimer);
      if (e instanceof DOMException) {
        console.warn('ABORT');
        reject(CusError.of(LOADER_ERROR.ABORT));
        return;
      }
      reject(CusError.of(LOADER_ERROR.LOAD_ERROR));
    });
}

export default curry(fetchLoader);
