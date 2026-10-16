set -e
for v in "outline=A:oA" "outline=B:oB" "outline=C:oC" "grade=B:gB" "grade=C:gC" "foliage=A:fA" "foliage=C:fC"; do
 q=${v%%:*}; o=${v##*:}; python3 capture.py variants "$q" $o 120; echo done $o; done
