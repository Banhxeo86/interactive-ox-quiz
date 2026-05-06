# Interactive Real-time OX Quiz

## 실행 방법
1. `node server.js` 또는 `npm start`
2. 교사용 화면: `http://localhost:3000/teacher.html`
3. 학생용 화면: `http://localhost:3000/student.html`

## 주요 기능
- 교사가 방 코드를 생성하고 학생이 코드로 입장
- 방별로 문제/응답/애니메이션이 서로 완전히 분리
- 교사가 문제를 입력하면 같은 방 참여자 화면에 즉시 반영
- 학생이 O/X 버튼을 누르면 실시간 집계 및 캐릭터 이동 애니메이션 재생
