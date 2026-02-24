# KR Passport Photo Cutter

한국 여권 사진 규정에 맞춰 사진을 크롭하는 정적 웹앱입니다.

- 고정 비율: `3.5 : 4.5`
- 출력: 규정 해상도 `413 x 531` JPG (고품질)
- JPEG는 `500KB 이하`를 만족하는 범위에서 가능한 최대 품질로 자동 저장
- 배경 제거가 필요하면 `remove.bg` 등 외부 서비스에서 먼저 처리 후 본 도구에서 크롭
- 빠른 회전: `0° / 90° / 180° / 270°`
- 수평 미세 조절: `-5.0° ~ +5.0°` 회전 보정
- 입력 조작:
  - 데스크톱: 프레임 드래그, 마우스 휠 크기 조절
  - 모바일: 프레임 드래그, 슬라이더 크기 조절

## 공식 규정 링크 (확인일: 2026-02-24)
- 여권사진 규격 안내: https://www.passport.go.kr/home/kor/contents.do?menuPos=32
- 온라인용 사진파일 안내: https://www.passport.go.kr/home/kor/contents.do?menuPos=12

## 로컬 실행
정적 파일이라 별도 빌드 없이 바로 실행 가능합니다.

```bash
# 예시: Python 내장 서버
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속
```

## GitHub Pages 배포
1. 이 저장소를 GitHub에 push
2. GitHub 저장소의 `Settings > Pages`
3. `Source`를 배포할 branch(예: `main`)와 `/ (root)`로 선택
4. 저장 후 배포 URL로 접속

## 파일 구조
- `index.html`: UI 레이아웃 + 규정 링크/예시 섹션
- `style.css`: 반응형 스타일
- `app.js`: 캔버스 크롭/가이드/고품질 JPG 출력 로직
- `PLAN.md`: 구현 계획서

## 주의
- 가이드 라인은 촬영/정렬 보조용입니다.
- 최종 접수 가능 여부는 실제 여권 심사 기준에 따라 달라질 수 있습니다.
- 드물게 500KB 이하 생성 실패 시 원본 사진의 노이즈/복잡도를 줄이거나 재촬영이 필요할 수 있습니다.
- 외부 배경 제거 결과는 머리카락/어깨 경계를 반드시 육안으로 확인하세요.
