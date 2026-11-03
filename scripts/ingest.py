#!/usr/bin/env python3
"""Read a bounded batch from stdin; credentials remain in designated local storage.
Default output is counts/status only. --show-digest prints sanitized digest text.
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

BASE = 'https://inbox-triage-api.inbox-triage-api.workers.dev'

def request(path, payload=None, authenticated=True, include_cache_control=False):
    """Return status and JSON; optionally include Cache-Control for delivery checks."""
    def result(status, body, cache_control=None):
        if include_cache_control:
            return status, body, cache_control
        return status, body

    headers = {'Content-Type': 'application/json', 'User-Agent': 'InboxTriage/1.0'}
    if authenticated:
        key = pathlib.Path.home().joinpath('.config/inbox-triage/key').read_text().strip()
        if not key or any(c in key for c in '\r\n'): raise RuntimeError('Invalid credential file')
        headers['Authorization'] = 'Bearer ' + key
    for attempt in range(3):
        req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=240) as response:
                return result(response.status, json.load(response), response.headers.get('Cache-Control'))
        except urllib.error.HTTPError as error:
            if attempt == 2 or error.code not in (429, 500, 502, 503, 504):
                cache_control = error.headers.get('Cache-Control') if error.headers else None
                return result(error.code, {'error': 'HTTP request rejected'}, cache_control)
        except (OSError, ValueError):
            if attempt == 2: return result(0, {'error': 'Transport or response failure'})
        time.sleep(0.5 * (attempt + 1))
    raise RuntimeError('Unreachable')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--show-digest', action='store_true')
    args = parser.parse_args()
    raw = sys.stdin.buffer.read(1_000_001)
    if len(raw)>1_000_000: raise ValueError('Input exceeds one megabyte')
    payload = json.loads(raw)
    status, result = request('/ingest', payload)
    evidence = {k:v for k,v in result.items() if k in ('generatedAt','source','accounts','inserted','duplicates','batchDuplicates','missingAccounts','windowHours','error')}
    evidence['httpStatus'] = status
    if args.show_digest: evidence['text'] = result.get('text','')
    print(json.dumps(evidence))
    return 0 if status==200 else 1

if __name__ == '__main__':
    try: sys.exit(main())
    except Exception: print(json.dumps({'error':'Invalid input, credential file, or transport configuration'})); sys.exit(1)
