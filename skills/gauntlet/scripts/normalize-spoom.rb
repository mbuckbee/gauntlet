#!/usr/bin/env ruby
# frozen_string_literal: true

# Turn `spoom deadcode` text into stable, location-free lines.
#
# Usage: normalize-spoom.rb < spoom-output
#
# Each output line is `<key>\t<location>`. The key carries no line numbers, so
# a finding that only moved between the base and the branch compares equal.

ANSI = /\e\[[0-9;]*m/
CANDIDATE = /\A\s+(\S+)\s+(\S+?):(\d+):\d+-\d+:\d+\s*\z/

text = $stdin.read.gsub(ANSI, "")
unless text.include?("Analyzing") || text.include?("No dead code")
  warn "spoom output not recognised:\n#{text[-2000..] || text}"
  exit 2
end

lines = []
in_candidates = false
text.each_line(chomp: true) do |line|
  if line.start_with?("Candidates:")
    in_candidates = true
    next
  end
  next unless in_candidates

  m = CANDIDATE.match(line) or next
  symbol, path, lineno = m.captures
  lines << "spoom #{symbol} #{path}\t#{path}:#{lineno}"
end
puts lines.uniq.sort
