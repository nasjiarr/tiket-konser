import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics
const holdSuccess = new Counter('ticket_war_hold_success');
const holdConflict = new Counter('ticket_war_hold_conflict');
const holdRateLimited = new Counter('ticket_war_hold_rate_limited');
const successfulRequestRate = new Rate('successful_requests');
const holdDuration = new Trend('hold_request_duration');

export const options = {
  scenarios: {
    // 1. Browsing traffic before ticket war (30 VUs)
    browsing_phase: {
      executor: 'constant-vus',
      vus: 30,
      duration: '5s',
      exec: 'browseEvent',
    },
    // 2. Ticket War Spike (50 concurrent users battling for the SAME seat simultaneously)
    ticket_war_spike: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 1,
      startTime: '6s',
      maxDuration: '10s',
      exec: 'ticketWarBattle',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<1500'], // 95% of requests under 1.5s (over network)
    'ticket_war_hold_success': ['count==1'], // EXACTLY ONE USER must win the seat
  },
};

const BASE_URL = __ENV.API_URL || 'http://100.65.227.30:3001';
const EVENT_ID = 'd614b47b-6335-466a-82d2-a1fea247b15e';
const TARGET_SEAT_ID = '196b0f0b-9736-4afe-882d-64198335cf95'; // CAT1-08

// Phase 1: Browse event & seat map
export function browseEvent() {
  const res = http.get(`${BASE_URL}/api/events/${EVENT_ID}`);
  const ok = check(res, {
    'event page status 200': (r) => r.status === 200,
  });
  successfulRequestRate.add(ok);
  sleep(0.2);
}

// Phase 2: 50 Virtual Users simultaneously rush to hold the exact same seat
export function ticketWarBattle() {
  const vuId = __VU;
  const uniqueUserId = `00000000-0000-0000-0000-${String(vuId).padStart(12, '0')}`;

  const payload = JSON.stringify({
    eventId: EVENT_ID,
    userId: uniqueUserId,
    seatIds: [TARGET_SEAT_ID],
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const start = new Date().getTime();
  const res = http.post(`${BASE_URL}/api/orders/hold`, payload, params);
  holdDuration.add(new Date().getTime() - start);

  if (res.status === 200) {
    holdSuccess.add(1);
    console.log(`🎉 [VU ${vuId}] WON THE TICKET WAR! Successfully held seat ${TARGET_SEAT_ID}`);
  } else if (res.status === 409) {
    holdConflict.add(1);
    // Blocked gracefully by Redis distributed lock or PostgreSQL row lock
  } else if (res.status === 429) {
    holdRateLimited.add(1);
  }

  check(res, {
    'handled gracefully (200 success or 409 conflict)': (r) =>
      r.status === 200 || r.status === 409,
  });
}
