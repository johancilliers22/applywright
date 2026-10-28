"""Released SH observation for SOURCE coordination; never a runtime/test lease."""
import datetime
import fcntl
import json
import os
import pathlib
import stat
import sys


def inspect_waiters(handle, require_visible=False):
    current = os.fstat(handle)
    identity = (os.major(current.st_dev), os.minor(current.st_dev), current.st_ino)
    visible = False
    waiting = False
    for row in pathlib.Path('/proc/locks').read_text(encoding='ascii').splitlines():
        fields = row.split()
        if len(fields) >= 6 and fields[1] in ('FLOCK', 'POSIX') and fields[2:4] == ['ADVISORY', 'READ']:
            major, minor, inode = fields[5].split(':')
            if (int(major, 16), int(minor, 16), int(inode)) == identity and int(fields[4]) == os.getpid():
                visible = True
        if '->' not in fields:
            continue
        position = fields.index('->') + 1
        if fields[position] not in ('FLOCK', 'POSIX') or fields[position + 1:position + 3] != ['ADVISORY', 'WRITE']:
            continue
        major, minor, inode = fields[position + 4].split(':')
        if (int(major, 16), int(minor, 16), int(inode)) == identity:
            waiting = True
    if require_visible and not visible:
        raise RuntimeError('LOCK_METADATA_HOLD')
    return waiting


result = {
    'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'SOURCE_OR_SAME_COORDINATOR_DISPATCH_ONLY_NOT_TEST_OR_LIVE_LEASE',
    'authority': 'ROOT-SOURCE-DISPATCH-LOCK-CLARIFICATION-20261028.md',
    'path': '/tmp/redline-heavy.lock',
    'canonicalSharedProbe': False,
    'probeReleasedBeforeDispatch': False,
    'actualProviderLifetimeAdmission': 'REQUIRED SEPARATELY; untouched',
}
handle = None
try:
    handle = os.open(result['path'], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    before = os.fstat(handle)
    if not stat.S_ISREG(before.st_mode):
        raise RuntimeError('LOCK_STORAGE_HOLD')
    if inspect_waiters(handle):
        raise RuntimeError('EX_WAITER_HOLD')
    fcntl.flock(handle, fcntl.LOCK_SH | fcntl.LOCK_NB)
    after = os.stat(result['path'], follow_symlinks=False)
    if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
        raise RuntimeError('HEAVY_LOCK_IDENTITY_HOLD')
    if inspect_waiters(handle, require_visible=True):
        raise RuntimeError('EX_WAITER_HOLD')
    result['canonicalSharedProbe'] = True
    result['decision'] = 'PASS_SOURCE_OBSERVATION_ONLY'
except (OSError, ValueError, IndexError, RuntimeError) as error:
    result['decision'] = 'HOLD'
    result['reason'] = str(error)
finally:
    if handle is not None:
        os.close(handle)
        result['probeReleasedBeforeDispatch'] = True
print(json.dumps(result))
if result.get('decision') == 'HOLD':
    sys.exit(75)
