"""Regenerate the synthetic public-data replay fixtures (T-102).

Everything here is SYNTHETIC: call signs (D7CR0x), vessel names (CERA SYNTH ...), B/L numbers (SYNBL...),
manifest numbers (26SYNT...), container numbers (owner code ZZZ) and berth names are made up. Only the XML
shape follows the official data.go.kr guides (DS-03 FILE_000000007708406 · DS-02 FILE_000000007709092,
portal revision 2026-10-06). No real response, key or identifier is stored in the repository (rule 5).

Run: python data/fixtures/public-data/generate.py   (stdlib only, writes next to this file)
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def check_digit(prefix10: str) -> str:
    values, v = {}, 10
    for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if v % 11 == 0:
            v += 1
        values[c] = v
        v += 1
    total = sum((int(ch) if ch.isdigit() else values[ch]) * (2**i) for i, ch in enumerate(prefix10))
    return str(total % 11 % 10)


def container_no(serial: int) -> str:
    p = f"ZZZU{serial:06d}"
    return p + check_digit(p)


def wrap(items: list[str], total: int, page: int, rows: int = 50, code: str = "00", msg: str = "NORMAL_SERVICE") -> str:
    body = "\n".join(items)
    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<response>\n  <header>\n"
        f"    <resultCode>{code}</resultCode>\n    <resultMsg>{msg}</resultMsg>\n  </header>\n  <body>\n"
        f"    <items>\n{body}\n    </items>\n    <numOfRows>{rows}</numOfRows>\n    <pageNo>{page}</pageNo>\n"
        f"    <totalCount>{total}</totalCount>\n  </body>\n</response>\n"
    )


def detail(**kv: str) -> str:
    inner = "".join(f"<{k}>{v}</{k}>" for k, v in kv.items())
    return f"          <detail>{inner}</detail>"


def vessel(seq: str, sign: str, name: str, kind_cd: str, kind_nm: str, details: list[str]) -> str:
    return (
        "      <item>"
        f"<prtAgCd>020</prtAgCd><prtAgNm>부산</prtAgNm><etryptYear>2026</etryptYear><etryptCo>{seq}</etryptCo>"
        f"<clsgn>{sign}</clsgn><vsslNm>{name}</vsslNm><vsslNltyCd>KR</vsslNltyCd><vsslNltyNm>대한민국</vsslNltyNm>"
        f"<vsslKndCd>{kind_cd}</vsslKndCd><vsslKndNm>{kind_nm}</vsslKndNm><etryptPurpsCd>01</etryptPurpsCd><etryptPurpsNm>양적하</etryptPurpsNm>"
        "<frstDpmprtNatPrtCd>XXSYN</frstDpmprtNatPrtCd><frstDpmprtPrtNm>SYNTH PORT</frstDpmprtPrtNm>"
        f"<details>\n" + "\n".join(details) + "\n        </details></item>"
    )


def ds03() -> str:
    items = [
        vessel("041", "D7CR01", "CERA SYNTH EXPRESS", "41", "풀컨테이너선", [
            detail(reqstSeNm="최종", etryndNm="입항", etryptDt="2026-10-20T06:30:00+09:00", ibobprtNm="외항",
                   laidupFcltyCd="SYA", laidupFcltySubCd="02", laidupFcltyNm="합성 터미널 A 2선석", grtg="50000",
                   crewCo="20", mrNum="26SYNT0041I", tkoffPrrrnDt="2026-10-21 22:00:00"),
            detail(reqstSeNm="최종", etryndNm="출항", tkoffDt="2026-10-21T22:00:00+09:00", ibobprtNm="외항",
                   laidupFcltyCd="SYA", laidupFcltySubCd="02", laidupFcltyNm="합성 터미널 A 2선석", mrNum="26SYNT0041E"),
        ]),
        vessel("017", "D7CR02", "CERA SYNTH BRIDGE", "41", "풀컨테이너선", [
            # 실제 응답에서 본 모양(2026-10-22): 신청구분 최초 · 변경 · 최종
            detail(reqstSeNm="최초", etryndNm="입항", etryptDt="2026-10-21T13:00:00+09:00", ibobprtNm="외항",
                   laidupFcltyCd="SYB", laidupFcltySubCd="05", laidupFcltyNm="합성 터미널 B 5선석", mrNum="26SYNT0017I"),
        ]),
        vessel("009", "D7CR03", "CERA SYNTH FUTURE", "41", "풀컨테이너선", [
            detail(reqstSeNm="최종", etryndNm="입항", etryptDt="2026-10-30T09:00:00+09:00", ibobprtNm="외항",
                   laidupFcltyCd="SYA", laidupFcltySubCd="01", laidupFcltyNm="합성 터미널 A 1선석", mrNum="26SYNT0009I"),
        ]),
        # 오프셋 없는 일시(Asia/Seoul 가정) · 컨테이너선 아님
        vessel("002", "D7CR04", "CERA SYNTH BULK", "21", "산물선(벌크선)", [
            # 실제 응답에서 본 모양(2026-10-22): `*` 로 시작하는 비표준 계선 시설 코드
            detail(reqstSeNm="변경", etryndNm="입항", etryptDt="2026-10-20 18:00:00", ibobprtNm="외항",
                   laidupFcltyCd="*SC", laidupFcltySubCd="03", laidupFcltyNm="합성 묘박지 3"),
        ]),
        # 호출부호가 빠진 행 — 정규화가 거른다
        "      <item><prtAgCd>020</prtAgCd><etryptYear>2026</etryptYear><etryptCo>050</etryptCo><vsslNm>CERA SYNTH BROKEN</vsslNm></item>",
    ]
    return wrap(items, total=5, page=1)


def manifest_line(seq: str, sign: str, name: str, mr: str, bl: str, msn: str, cntr: str, iso: str, size: str, direction: str = "II") -> str:
    dir_nm = "수입" if direction == "II" else "수출"
    return (
        "      <item>"
        f"<prtAgCd>020</prtAgCd><prtAgNm>부산</prtAgNm><etryptYear>2026</etryptYear><etryptCo>{seq}</etryptCo><clsgn>{sign}</clsgn>"
        f"<vsslNm>{name}</vsslNm><mrNum>{mr}</mrNum><blNo>{bl}</blNo><msnNo>{msn}</msnNo>"
        "<etryndDt>2026-10-20T06:30:00+09:00</etryndDt>"
        f"<tkinTkoutSe>{direction}</tkinTkoutSe><tkinTkoutNm>{dir_nm}</tkinTkoutNm><entrpsCd>SYN0001</entrpsCd><entrpsNm>합성 선사</entrpsNm>"
        f"<contnNo>{cntr}</contnNo><contnStndrd>{iso}</contnStndrd><contnSize>{size}</contnSize></item>"
    )


def ds02() -> tuple[str, str]:
    isos = [("22G1", "20"), ("45G1", "40"), ("42G1", "40"), ("45R1", "40"), ("22GP", "20")]
    lines = []
    for i in range(51):
        iso, size = isos[i % len(isos)]
        bl_n = i // 5 + 1
        lines.append(manifest_line("041", "D7CR01", "CERA SYNTH EXPRESS", "26SYNT0041I", f"SYNBL26{bl_n:06d}", f"{bl_n:04d}", container_no(100 + i), iso, size))
    # 체크 숫자가 틀린 컨테이너(받되 신뢰도 LOW)
    bad = container_no(900)
    wrong = bad[:-1] + str((int(bad[-1]) + 1) % 10)
    lines[7] = manifest_line("041", "D7CR01", "CERA SYNTH EXPRESS", "26SYNT0041I", "SYNBL26000002", "0002", wrong, "22G1", "20")
    # 수입이 아닌 줄 · 컨테이너 번호 모양이 틀린 줄
    lines.append(manifest_line("041", "D7CR01", "CERA SYNTH EXPRESS", "26SYNT0041I", "SYNBL26900001", "0900", container_no(950), "22G1", "20", direction="OE"))
    lines.append(manifest_line("041", "D7CR01", "CERA SYNTH EXPRESS", "26SYNT0041I", "SYNBL26900002", "0901", "BAD-NUMBER", "22G1", "20"))
    total = len(lines)  # 53
    return wrap(lines[:50], total=total, page=1), wrap(lines[50:], total=total, page=2)


def main() -> None:
    (HERE / "ds03").mkdir(exist_ok=True)
    (HERE / "ds02").mkdir(exist_ok=True)
    (HERE / "ds03" / "busan-20261020-20261021-p1.xml").write_text(ds03(), encoding="utf-8")
    p1, p2 = ds02()
    (HERE / "ds02" / "D7CR01-2026-041-p1.xml").write_text(p1, encoding="utf-8")
    (HERE / "ds02" / "D7CR01-2026-041-p2.xml").write_text(p2, encoding="utf-8")
    # 데이터 없음은 00 + 0건으로 온다(2026-10-22 live). 03 은 관측되지 않았다
    (HERE / "ds02" / "D7CR02-2026-017-p1.xml").write_text(wrap([], total=0, page=1), encoding="utf-8")
    common03 = {"prtAgCd": "020", "deGb": "I"}
    entries = [
        {"dataset": "MOF_VESSEL_CALL", "match": {**common03, "sde": "20261020", "ede": "20261021", "pageNo": "1"}, "file": "ds03/busan-20261020-20261021-p1.xml"},
        {"dataset": "MOF_CONTAINER_MANIFEST", "match": {"prtAgCd": "020", "etryptYear": "2026", "etryptCo": "041", "clsgn": "D7CR01", "pageNo": "1"}, "file": "ds02/D7CR01-2026-041-p1.xml"},
        {"dataset": "MOF_CONTAINER_MANIFEST", "match": {"prtAgCd": "020", "etryptYear": "2026", "etryptCo": "041", "clsgn": "D7CR01", "pageNo": "2"}, "file": "ds02/D7CR01-2026-041-p2.xml"},
        {"dataset": "MOF_CONTAINER_MANIFEST", "match": {"prtAgCd": "020", "etryptYear": "2026", "etryptCo": "017", "clsgn": "D7CR02", "pageNo": "1"}, "file": "ds02/D7CR02-2026-017-p1.xml"},
    ]
    (HERE / "index.json").write_text(json.dumps({"synthetic": True, "entries": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
