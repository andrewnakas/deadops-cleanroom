#!/bin/sh
# Every suite, one browser at a time, one line per result.
cd "$(dirname "$0")/.." || exit 1
fail=0
for t in routes weapons mobile waves tdm yard wharf recovery holdout holdout-yard progress lobby p2p api backend; do
  if npm run -s test:$t >/tmp/graveshift-test.log 2>&1; then echo "PASS $t"; else echo "FAIL $t"; tail -4 /tmp/graveshift-test.log; fail=1; fi
done
npm test 2>&1 | grep -aE "^. (pass|fail) "
npm run -s check:marks | tail -1
npm run -s check:licences | tail -1
exit $fail
